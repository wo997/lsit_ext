// @ts-check

import * as vscode from "vscode";
import * as fs from 'fs';
import { Program, Block } from 'php-parser';


const engine = require('php-parser');

// initialize a new parser instance
const php_parser = new engine({
    parser: {
        //extractDoc: true,
        php7: true,
        locations: true,
        suppressErrors: true,
    },
    ast: {
        withPositions: true
    }
});

const window = vscode.window;

let entity_data_files: any = {};
let entity_definitions: any = {};
let code_data_in_current_editor: any = {};
let visibleRanges: vscode.Range[] | undefined = undefined;
let textChangeEventTimeout: any = null;

let php_parsed: any = null;

interface file_data {
    entity_name: any,
    entity_definition: any,
}

const decorate_annotation = vscode.window.createTextEditorDecorationType({
    color: '#a3c',
    fontWeight: 'bold',
    /*fontWeight: 'bold',
    fontStyle: 'italic',
    backgroundColor: '#005'*/
});

const decorate_entity = vscode.window.createTextEditorDecorationType({
    /*color: '#44e',
    fontWeight: 'bold',*/
    fontWeight: 'bold',
    //fontStyle: 'italic',
    //"outline": "2px solid red",
    //"border": "2px solid #fff2",
    //border: "1px solid #fff2",
    //backgroundColor: '#0004',
    backgroundColor: '#0581',
    border: '2px solid #0583',
    borderRadius: '2px',
    //textDecoration: "underline",
    /*backgroundColor: '#024'*/
});

const decorate_expression = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'green'
});

const docorate_exclude = vscode.window.createTextEditorDecorationType({
    backgroundColor: '#f002'
});

// replaced with php parser yay
//const match_entities_regex = /(?<=\[("))([\w^_])*(?=(__\w*"\]))|(?<=\$)([\w^_])*(?=(__\w*\["))/g;
//const match_entities_regex = /(?<=(\[))"([\w^_])*__\w*"(?=(\]))|(?<=)\$([\w^_])*__\w*/g;

let workspace_path = "";

export function activate(context: vscode.ExtensionContext) {
    if (vscode.workspace.workspaceFolders) {
        workspace_path = vscode.workspace.workspaceFolders[0].uri.path;
    }

    indexFiles();

    watchFiles();

    initSyntaxDecorator();

    let disposable = vscode.commands.registerCommand(
        "lsit.helloWorld",
        () => {
            const editor = window.activeTextEditor;

            if (!editor) {
                window.showInformationMessage("Editor doesn't exist");
                return;
            }

            const text = editor.document.getText(editor.selection);

            const options = [
                { label: "pies", value: "aaa" },
                { label: "kot", value: "vvv" },
                { label: "żółw", value: "ccc" }
            ];

            const quickPick = window.createQuickPick();
            quickPick.items = options;
            quickPick.onDidChangeSelection((selection: any) => {

                if (selection[0]) {
                    const newText = selection[0].value;
                    editor.edit((edit: any) => {
                        edit.insert(new vscode.Position(editor.selection.active.line, editor.selection.active.character), newText);
                    });

                    quickPick.dispose();
                }
            });
            quickPick.onDidHide(() => quickPick.dispose());
            quickPick.show();
        }
    );

    const provideCompletionItems = (document: vscode.TextDocument, position: vscode.Position) => {
        const linePrefix = document.lineAt(position).text.substr(0, position.character);

        // spot entity by __
        const entity_name_index = linePrefix.lastIndexOf("__");
        if (entity_name_index !== -1) {
            for (const code_part_data of code_data_in_current_editor) {
                if (code_part_data.entity && code_part_data.loc.start.line - 1 === position.line && code_part_data.loc.start.column <= entity_name_index && code_part_data.loc.end.column >= entity_name_index) {
                    const start_index = entity_name_index + 2;
                    const match = linePrefix.substr(start_index).match(/\w*(["']\])?\[["']\w*/);
                    if (match && match[0] && match[0].length === linePrefix.length - start_index) {
                        return code_part_data.entity.suggestions;
                    }
                }
            }
        }

        // spot function argument
        for (const code_part_data of code_data_in_current_editor) {
            //console.log("test", code_part_data.entry, "p1", code_part_data.loc.start, "p2", position, code_part_data.loc.start.column <= position.character, code_part_data.loc.end.column >= position.character);
            if (code_part_data.entry && code_part_data.entry.entity && code_part_data.loc.start.line - 1 === position.line && code_part_data.loc.start.column <= position.character && code_part_data.loc.end.column >= position.character) {
                let entity_name = code_part_data.entry.entity.name;

                //console.log("omw", code_part_data, { entity_name });

                const entity_data = entity_definitions[entity_name];
                //console.log({ entity_data });
                if (!entity_data || !entity_data.properties) {
                    continue;
                }

                let suggestions: any = [];
                Object.entries(entity_data.properties).forEach(([property_name, property_data]: [any, any]) => {

                    const completion_item = new vscode.CompletionItem(property_name, vscode.CompletionItemKind.Property)
                    if (property_data.type) {
                        completion_item.detail = property_data.type;
                    }
                    // TODO: greeeeeat, we can cleanup single line of code 
                    /*completion_item.command = {
                        title: "aaa",
                        command: "",
                    };*/

                    if (property_data.description) {
                        completion_item.documentation = property_data.description;
                    }
                    suggestions.push(completion_item);
                });
                return suggestions;

                //console.log("love");
            }
        }


        return noEntityFound();
    };

    const provider = vscode.languages.registerCompletionItemProvider(
        'php',
        {
            provideCompletionItems
        },
        `"`,
        `'`
    );

    context.subscriptions.push(provider, disposable);

    if (vscode.window.activeTextEditor) {
        decorateActiveEditor(vscode.window.activeTextEditor.document.uri);
    }
}

// this method is called when your extension is deactivated
export function deactivate() { }

function noEntityFound() {
    return undefined;

}
function entityFound(entity_name: string) {
    const entity_data = entity_definitions[entity_name];
    if (!entity_data || !entity_data.properties) {
        return noEntityFound();
    }

    let suggestions: any = [];
    Object.entries(entity_data.properties).forEach(([property_name, property_data]: [any, any]) => {

        const completion_item = new vscode.CompletionItem(property_name, vscode.CompletionItemKind.Property)
        if (property_data.type) {
            completion_item.detail = property_data.type;
        }

        if (property_data.description) {
            completion_item.documentation = property_data.description;
        }
        suggestions.push(completion_item);
    });
    return suggestions;
};

function updateDefiniton(entity_name: string) {
    let entity_definition: any = {};

    Object.entries(entity_data_files).forEach(([file_path, file_data]: any) => {
        if (!file_data || file_data.entity_name !== entity_name) {
            return;
        }
        // TODO: it's a place where you want to merge props and methods maybe
        entity_definition = deepMerge(entity_definition, file_data.entity_definition);
    });

    entity_definitions[entity_name] = entity_definition;
}

function updateFile(file_path: string): file_data {
    const def_str = "_definition.json";

    const file_name = file_path.substr(file_path.lastIndexOf("/") + 1);

    let entity_name: any = null;
    let entity_definition: any = null;

    if (file_name.endsWith(def_str)) {
        entity_name = file_name.substring(0, file_name.length - def_str.length);

        try {
            file_path = filePathClean(file_path);
            const text_content = fs.readFileSync(file_path, "utf-8");
            const file_parsed = JSON.parse(text_content);

            entity_definition = file_parsed;
        }
        catch (e) { }
    }

    return {
        entity_name,
        entity_definition
    };
}

function filePathClean(file_path: string): string {
    if (file_path.charAt(0) == "/") {
        return file_path.substring(1);
    }
    return file_path;
}
function indexFiles() {
    /* "activationEvents": [
        "onCommand:lsit.helloWorld",
        "onLanguage:php"
    ],*/

    if (!vscode.workspace.workspaceFolders || !vscode.workspace.workspaceFolders[0]) {
        return null;
    }

    const project_root: fs.PathLike = filePathClean(vscode.workspace.workspaceFolders[0].uri.path);

    const scanFilesInDir: any = (dir: string) => {
        let entity_data_files_sub: any = {};
        fs.readdirSync(dir, { withFileTypes: true }).forEach(file => {
            const file_path = `${dir}/${file.name}`;

            if (file.isDirectory()) {
                if (file.name.charAt(0) == "." || ["vendor", "builds", "prebuilds", "settings", "uploads"].includes(file.name)) {
                    return;
                }
                Object.assign(entity_data_files_sub, scanFilesInDir(file_path));
            } else {
                const data = updateFile(file_path);
                if (data.entity_name) {
                    entity_data_files_sub[file_path] = data;
                }
            }
        });

        return entity_data_files_sub;
    }

    entity_data_files = scanFilesInDir(project_root);

    let unique_entities: any = [];
    Object.entries(entity_data_files).forEach(([file_path, file_data]: any) => {
        if (unique_entities.includes(file_data.entity_name)) {
            return;
        }
        unique_entities.push(file_data.entity_name);
        updateDefiniton(file_data.entity_name);
    });

}

function watchFiles() {
    const watcher: vscode.FileSystemWatcher = vscode.workspace.createFileSystemWatcher("**/*.json"); //glob search string

    const anyFilechange = (uri: vscode.Uri) => {
        const file_path = filePathClean(uri.path);
        const file_data = updateFile(file_path);

        if (file_data.entity_name) {
            entity_data_files[file_path] = file_data;
            updateDefiniton(file_data.entity_name);
        }

        vscode.window.showInformationMessage("LSIT indexed changes in " + file_path);
    }
    watcher.onDidCreate(anyFilechange);
    watcher.onDidChange(anyFilechange);
    watcher.onDidDelete(anyFilechange);
}

function initSyntaxDecorator() {
    vscode.workspace.onDidChangeTextDocument(event => {
        console.log(`Did change: ${event.document.uri}`, event);
        // TODO:
        // when "" or '' added you can easily tell that there is , in front comming, ezy man
        // but rly that ezy? what if it was fine before? well here is a solution
        // do that ONLY when you catch an error, simply repeat the process with that string assumed
        // or maybe u wanna put it for a user but that might be too much
        // only autocompletion should actually do that though

        decorateActiveEditor(event.document.uri);

        if (textChangeEventTimeout) {
            clearTimeout(textChangeEventTimeout);
        }

        // that says that we wanna parse everything (not just visibly stuff) only when the dev is waiting
        textChangeEventTimeout = setTimeout(() => {
            textChangeEventTimeout = null;
            decorateActiveEditor(event.document.uri);
        }, 200);
    });

    /*vscode.window.onDidChangeVisibleTextEditors(textEditors => {
        console.log("vis", textEditors);
        for (const editor of textEditors) {
            console.log("vixs", editor.uri);
        }
    });*/

    vscode.window.onDidChangeActiveTextEditor(event => {
        console.log("Did change editor", event);

        if (event && event.document) {
            decorateActiveEditor(event.document.uri);
        }
    })
    vscode.workspace.onDidOpenTextDocument(document => {
        console.log(`Did open: ${document.uri}`);

        decorateActiveEditor(document.uri);
    });
}

function extractEntityName(str: string) {
    const matches = str.match(/\w*__/);
    if (matches) {
        const match = matches[0];
        return match.substr(0, match.length - 2);
    }
    return "";
}

interface codeDataFull {
    code_data: Array<any>,
    buffer: any
}

function parseCodePart(code_part: any, buffer: any = {}): codeDataFull {
    //console.log("cp+kind", code_part, code_part.kind);

    buffer = cloneObject(buffer);

    let code_data_full: codeDataFull = {
        code_data: [],
        buffer: buffer,
    }

    if (!visibleRanges) {
        return code_data_full;
    }
    const visibleRange = visibleRanges[0];

    if (visibleRange.start === null || visibleRange.end === null) {
        //console.log("fuck no");

        return code_data_full;
    }


    //console.log(JSON.stringify(visibleRange), Object.keys(visibleRange));
    const cx0 = code_part.loc.start.column;
    const cy0 = code_part.loc.start.line - 1;
    const cx1 = code_part.loc.end.column;
    const cy1 = code_part.loc.end.line - 1;
    //const vx0 = visibleRange.start.character;
    const vy0 = visibleRange.start.line;
    //const vx1 = visibleRange.endcharacter;
    const vy1 = visibleRange.end.line;

    //cx1 >= vx0 &&//cx0 <= vx1 &&

    // editing? show just the part we can see, eeeeezy
    if (textChangeEventTimeout) {
        if (cy0 <= vy1 && cy1 >= vy0) {
            // code part is visible - optimisation purpose, from 30ms on 2000 lines to 4ms, worth it? kinda
            //console.log("inside" + " " + cy0 + " " + cy1 + " " + vy0 + " " + vy1);
        }
        else {
            //console.log("outside", code_part);
            //console.log("outside" + " " + cy0 + " " + cy1 + " " + vy0 + " " + vy1);
            return code_data_full;
        }
    }

    //console.log("some_code_part: " + code_part.kind, code_part);

    // say how far the parent expression is
    if (buffer.function) {
        buffer.function.levels++;
    }
    if (buffer.array) {
        buffer.array.levels++;
    }
    if (buffer.entity) {
        buffer.entity.levels++;
    }
    if (buffer.assign) {
        buffer.assign.levels++;
    }
    if (buffer.key) {
        buffer.key.levels++;
    }

    switch (code_part.kind) {
        case "program":
            code_data_full = parseProgram(code_part, buffer);
            break;
        case "function":
            code_data_full = parseFunction(code_part, buffer);
            break;
        case "expressionstatement":
            code_data_full = parseExpressionStatement(code_part, buffer);
            break;
        case "echo":
            code_data_full = parseExpressions(code_part, buffer);
            break;
        case "offsetlookup":
            code_data_full = parseOffestLookup(code_part, buffer);
            break;
        case "variable":
            code_data_full = parseVariable(code_part, buffer);
            break;
        case "array":
            code_data_full = parseArray(code_part, buffer);
            break;
        case "entry":
            code_data_full = parseEntry(code_part, buffer);
            break;
        case "call":
            code_data_full = parseCall(code_part, buffer);
            break;
        case "assign":
            code_data_full = parseAssign(code_part, buffer);
            break;
        case "if":
            code_data_full = parseIf(code_part, buffer);
            break;
        case "block":
            code_data_full = parseBlock(code_part, buffer);
            break;
        case "class":
            code_data_full = parseClass(code_part, buffer);
            break;
        case "method":
            code_data_full = parseMethod(code_part, buffer);
            break;

    }


    //console.log("some_code_part_Red", code_data_full);


    return code_data_full;
}

function parseProgram(code_part: Program, buffer: any): codeDataFull {
    code_part.children
    let code_data_full: codeDataFull = {
        code_data: [],
        buffer: buffer,
    }

    for (const sub_code_part of code_part.children) {
        const sub_code_data_full = parseCodePart(sub_code_part, buffer);
        code_data_full.code_data.push(...sub_code_data_full.code_data);
        deepMerge(code_data_full.buffer, sub_code_data_full.buffer);
    }

    return code_data_full;
}

function parseFunction(code_part: any, buffer: any): codeDataFull {
    let code_data_full: codeDataFull = {
        code_data: [],
        buffer: buffer,
    }

    for (const sub_code_part of code_part.body.children) {
        const sub_code_data_full = parseCodePart(sub_code_part, buffer);
        code_data_full.code_data.push(...sub_code_data_full.code_data);
        deepMerge(code_data_full.buffer, sub_code_data_full.buffer);
    }
    return code_data_full;
}

function parseMethod(code_part: any, buffer: any): codeDataFull {
    let code_data_full: codeDataFull = {
        code_data: [],
        buffer: buffer,
    }

    for (const sub_code_part of code_part.body.children) {
        const sub_code_data_full = parseCodePart(sub_code_part, buffer);
        code_data_full.code_data.push(...sub_code_data_full.code_data);
        deepMerge(code_data_full.buffer, sub_code_data_full.buffer);
    }
    return code_data_full;
}

function parseBlock(code_part: Block, buffer: any): codeDataFull {
    let code_data_full: codeDataFull = {
        code_data: [],
        buffer: buffer,
    }

    for (const sub_code_part of code_part.children) {
        const sub_code_data_full = parseCodePart(sub_code_part, buffer);
        code_data_full.code_data.push(...sub_code_data_full.code_data);
        deepMerge(code_data_full.buffer, sub_code_data_full.buffer);
    }
    return code_data_full;
}

function parseClass(code_part: any, buffer: any): codeDataFull {
    let code_data_full: codeDataFull = {
        code_data: [],
        buffer: buffer,
    }

    for (const sub_code_part of code_part.body) {
        const sub_code_data_full = parseCodePart(sub_code_part, buffer);
        code_data_full.code_data.push(...sub_code_data_full.code_data);
        deepMerge(code_data_full.buffer, sub_code_data_full.buffer);
    }
    return code_data_full;
}

function parseIf(code_part: any, buffer: any): codeDataFull {
    let code_data_full: codeDataFull = {
        code_data: [],
        buffer: buffer,
    }

    const test_code_data_full = parseCodePart(code_part.test, buffer);
    code_data_full.code_data.push(...test_code_data_full.code_data);
    deepMerge(code_data_full.buffer, test_code_data_full.buffer);

    const body_code_data_full = parseCodePart(code_part.body, buffer);
    code_data_full.code_data.push(...body_code_data_full.code_data);
    deepMerge(code_data_full.buffer, body_code_data_full.buffer);

    return code_data_full;
}


function parseArray(code_part: any, buffer: any): codeDataFull {
    let code_data_full: codeDataFull = {
        code_data: [],
        buffer: buffer,
    }

    //let entity_name = null;
    //console.log("hey", buffer.function, buffer.function.levels == 1, buffer.argument);
    if (buffer.function && buffer.function.levels === 1 && buffer.argument) {
        //console.log("it's ", code_part);
        // TODO: you have to extract that data from somewhere else for sure, that should be ezy man
        if (buffer.function.name == "paginateData" && buffer.argument.index === 0) {
            //entity_name = "pagination_params"
            buffer.entity = {
                name: "pagination_params",
                levels: 0,
            };
        }


        /*if (buffer.argument.index !== null) {
            console.log("argument.index ", buffer.argument.index);
        }*/
    }

    //console.log({ code_part_items: code_part.items });
    let array_index = -1;
    for (const sub_code_part of code_part.items) {
        array_index++;
        buffer.array = {
            index: array_index,
            levels: 0,
        };
        //console.log("arr", sub_code_part);
        const sub_code_data_full = parseCodePart(sub_code_part, buffer);
        code_data_full.code_data.push(...sub_code_data_full.code_data);
        deepMerge(code_data_full.buffer, sub_code_data_full.buffer);
    }

    return code_data_full;
}

function parseEntry(code_part: any, buffer: any): codeDataFull {
    let code_data_full: codeDataFull = {
        code_data: [],
        buffer: buffer,
    }

    //console.log("ENTRY BUFFER", { buffer });

    //const key = code_part.key;
    // we let it be a value so the user can see it highlighted ;)
    const pseudo_key = code_part.key ? code_part.key : code_part.value;

    if (pseudo_key && pseudo_key.kind === "string") {
        const entry_text = pseudo_key ? pseudo_key.value : null;
        const loc = pseudo_key ? pseudo_key.loc : code_part.loc;

        let from_entity = null;

        if (buffer.assign && buffer.assign.levels === 2) {
            const entity_name = extractEntityName(buffer.assign.left.name);
            if (buffer.assign.left.kind == "variable" && entity_name) {
                from_entity = {
                    name: entity_name
                }
            }
        }
        if (buffer.key && buffer.key.levels === 2) {
            const entity_name = extractEntityName(buffer.key.text);
            if (entity_name) {
                from_entity = {
                    name: entity_name
                }
            }
        }
        else if (buffer.entity && buffer.entity.levels === 1) {
            from_entity = buffer.entity;
        }

        if (from_entity) {
            code_data_full.code_data.push({
                loc: loc,
                entry: {
                    text: entry_text,
                    entity: from_entity
                },
            });
        }

        const entity_from_key_name = extractEntityName(entry_text);
        if (entity_from_key_name) {
            code_data_full.code_data.push(getEntityInCodeObj(loc, entity_from_key_name));
        }
    }

    if (code_part.key && code_part.key.kind === "string" && code_part.value) {
        buffer.key = {
            text: code_part.key.value,
            levels: 0,
        };

        const sub_code_data_full = parseCodePart(code_part.value, buffer);
        code_data_full.code_data.push(...sub_code_data_full.code_data);
        deepMerge(code_data_full.buffer, sub_code_data_full.buffer);
    }

    return code_data_full;
}

/* actual function execution ;) */
function parseCall(code_part: any, buffer: any): codeDataFull {
    let code_data_full: codeDataFull = {
        code_data: [],
        buffer: buffer,
    }

    code_data_full.buffer.function = {
        name: code_part.what.name,
        levels: 0,
    };

    //console.log("buffer", code_data_full.buffer, code_part.what.name);

    //console.log("parseCall", code_part);
    let arg_index = 0;
    for (const sub_code_part of code_part.arguments) {
        buffer.argument = {
            index: arg_index,
            levels: 0
        }
        arg_index++;
        const sub_code_data_full = parseCodePart(sub_code_part, buffer);
        code_data_full.code_data.push(...sub_code_data_full.code_data);
        deepMerge(code_data_full.buffer, sub_code_data_full.buffer);
    }

    return code_data_full;
}

function parseAssign(code_part: any, buffer: any): codeDataFull {
    let code_data_full: codeDataFull = {
        code_data: [],
        buffer: buffer,
    }

    const sub_code_data_full_left = parseCodePart(code_part.left, buffer);
    code_data_full.code_data.push(...sub_code_data_full_left.code_data);
    deepMerge(code_data_full.buffer, sub_code_data_full_left.buffer);

    buffer.assign = {
        left: code_part.left,
        levels: 0
    }

    const sub_code_data_full_right = parseCodePart(code_part.right, buffer);
    code_data_full.code_data.push(...sub_code_data_full_right.code_data);
    deepMerge(code_data_full.buffer, sub_code_data_full_right.buffer);

    return code_data_full;
}

function parseExpressionStatement(code_part: any, buffer: any): codeDataFull {
    return parseCodePart(code_part.expression);
}

function parseExpressions(code_part: any, buffer: any): codeDataFull {
    let code_data_full: codeDataFull = {
        code_data: [],
        buffer: buffer,
    }

    //console.log("echo", code_part.expressions);
    for (const sub_code_part of code_part.expressions) {
        const sub_code_data_full = parseCodePart(sub_code_part, buffer);
        code_data_full.code_data.push(...sub_code_data_full.code_data);
        deepMerge(code_data_full.buffer, sub_code_data_full.buffer);
    }

    return code_data_full;
}

function parseVariable(code_part: any, buffer: any): codeDataFull {
    let code_data_full: codeDataFull = {
        code_data: [],
        buffer: buffer,
    }

    if (code_part.name) {
        const entity_name = extractEntityName(code_part.name);
        if (entity_name) {
            code_data_full.code_data.push(getEntityInCodeObj(code_part.loc, entity_name));
        }
    }

    return code_data_full;
}

function parseOffestLookup(code_part: any, buffer: any): codeDataFull {
    let code_data_full: codeDataFull = {
        code_data: [],
        buffer: buffer,
    }

    //console.log("buffer", buffer);

    let name_objs = [];
    let previous_key_obj = code_part;
    while (previous_key_obj && previous_key_obj.kind == "offsetlookup") {
        if (previous_key_obj.what.kind == "variable") {
            name_objs.push(previous_key_obj.what);
        }
        if (previous_key_obj.offset.kind == "string") {
            name_objs.push(previous_key_obj.offset);
        }
        previous_key_obj = previous_key_obj.what;
    }

    for (const name_obj of name_objs) {
        const name = name_obj.name ? name_obj.name : name_obj.value;
        if (name) {
            const entity_name = extractEntityName(name);
            if (entity_name) {
                code_data_full.code_data.push(getEntityInCodeObj(name_obj.loc, entity_name));
            }
        }
    }

    return code_data_full;
}

function getEntityInCodeObj(loc: any, entity_name: string) {
    return {
        loc: loc,
        entity: {
            name: entity_name,
            suggestions: entityFound(entity_name),
        }
    };
}

function decorateActiveEditor(uri: vscode.Uri) {
    const editor = vscode.window.activeTextEditor;
    if (!editor?.document || editor.document.uri !== uri) {
        return;
    }

    const document = editor.document;

    const IS_JS = document.uri.path.endsWith(".js");
    const IS_PHP = document.uri.path.endsWith(".php");

    /*const actualSourceCode = document.getText();

    const actual_php_parsed = php_parser.parseCode(actualSourceCode, {
        parser: {
            suppressErrors: false,
        },
    });


    const actualSourceCodeArr = actualSourceCode.split('\n');
    const char_prev = actualSourceCode[editor.selection.start.line][editor.selection.start.character-1];
    const char_next = actualSourceCode[editor.selection.start.line][editor.selection.end.character+1];
    if ( == "" && actualSourceCode[editor.selection.start.line][editor.selection.start.character+1] == '"') {

    }*/



    const sourceCode = document.getText();

    let annotation_decorations: vscode.DecorationOptions[] = [];
    let entity_decorations: vscode.DecorationOptions[] = [];
    let expression_decorations: vscode.DecorationOptions[] = [];
    let exclude_decorations: vscode.DecorationOptions[] = [];

    const sourceCodeArr = sourceCode.split('\n');

    let temp_code_data_in_current_editor = [];

    visibleRanges = vscode.window.activeTextEditor?.visibleRanges;

    if (IS_PHP && visibleRanges && visibleRanges[0]) {
        const d0 = new Date();

        php_parsed = php_parser.parseCode(sourceCode);

        //console.log("PoSiTiOn", visibleRanges);

        /*if (!php_parsed) {
        }*/

        //const php_parsed = php_parser.parseCode(sourceCode);

        // parsing the file is really quick, you can literally do it every time for up to 1000 lines files with about 100ms delay
        // TODO you might need to parse just the part of code that was just edited or u can work on the set that u have adn modify it
        // I would rather parse each piece again yup and we gotta use the buffer
        console.log("Parse AST time: " + ((new Date()).getTime() - d0.getTime()).toString());
        //console.log("xxx", php_parsed);

        //console.log("await_code_data");

        try {
            const d = new Date();

            const code_data_full = parseCodePart(php_parsed);

            const code_data = code_data_full.code_data;

            console.log("Parse visible code time " + ((new Date()).getTime() - d.getTime()).toString());

            temp_code_data_in_current_editor = code_data;

            //console.log("code_data", code_data);

            for (const code_part_data of code_data) {
                const loc = code_part_data.loc;

                let range = new vscode.Range(
                    new vscode.Position(loc.start.line - 1, loc.start.column),
                    new vscode.Position(loc.end.line - 1, loc.end.column),
                );

                if (code_part_data.entity) {
                    const entity_name = code_part_data.entity.name;

                    //code_part_data.entity.suggestions

                    // reference_files could also be semi cached once we find something, totally optional
                    // OR EVEN BETTER you can repeat the process for repeating entities or go for a singleton style
                    // butt... I don't think we will even need them lol
                    const reference_files = Object.entries(entity_data_files).filter(([file, data]: any) => {
                        return data.entity_name === entity_name;
                    }).map(e => {
                        return e[0];
                    });
                    const reference_files_string = reference_files.map(e => { return `[${e.replace(filePathClean(workspace_path), '')}](/${e})` }).join("\n\n");

                    let definition_pretty_string = "";
                    const entity_definition = entity_definitions[entity_name];
                    const entity_properties = Object.keys(entity_definition.properties);
                    if (entity_properties.length > 0) {
                        definition_pretty_string += "\n\n**Properties:**" + entity_properties.map(e => { return "\n\n• " + e }).join("");
                    }

                    const myContent = new vscode.MarkdownString(`**Entity name:**\n\n${entity_name}${definition_pretty_string}\n\n**See definitions:**\n\n${reference_files_string}`);
                    myContent.isTrusted = true;

                    let decoration: vscode.DecorationOptions = { range, hoverMessage: myContent };

                    entity_decorations.push(decoration);
                }

                if (code_part_data.entry) {
                    const prop_name = code_part_data.entry.text;

                    const entity_name = code_part_data.entry.entity.name;
                    const entity_definition = entity_definitions[code_part_data.entry.entity.name];
                    if (!entity_definition || !entity_definition.properties || !Object.keys(entity_definition.properties).includes(prop_name)) {
                        continue;
                    }

                    let description = "";
                    const property_obj: any = Object.entries(entity_definition.properties).find(([name, props]) => {
                        return name === prop_name;
                    });
                    if (property_obj) {
                        const property_data = property_obj[1];
                        if (property_data.type) {
                            description += `**Type:**\n\n${property_data.type}`;
                        }
                        if (property_data.description) {
                            description += `\n\n**Description:**\n\n${property_data.description}`;
                        }
                        description += `\n\n**Instance of:**\n\n${entity_name}`;
                        description += `\n\n**Property name:**\n\n${prop_name}`;
                    }

                    const myContent = new vscode.MarkdownString(description);
                    myContent.isTrusted = true;

                    let decoration: vscode.DecorationOptions = { range, hoverMessage: myContent };

                    // that's kinda fake, it is actually an entry decoration but I use it as a style
                    entity_decorations.push(decoration);
                }
            }
        } catch (e) {
            console.error('get code data errors:', e);
        } finally {
            console.error('fuck meeee');
        }
    }

    code_data_in_current_editor = temp_code_data_in_current_editor;

    const sourceCodeArrLen = sourceCodeArr.length;
    let exclude_start_line = null;
    for (let line_id = 0; line_id < sourceCodeArrLen; line_id++) {
        const line = sourceCodeArr[line_id];

        if (line_id === 0) {
            if (IS_PHP) {
                const match_annotation = line.match(/(<\?php \/\/.*\[.*\])/);

                if (match_annotation !== null) {
                    const slash_ind = line.indexOf("//");
                    const open_bracket_ind = line.indexOf("[", slash_ind);
                    const close_bracket_ind = line.indexOf("]", open_bracket_ind);

                    let range = new vscode.Range(
                        new vscode.Position(line_id, slash_ind + 2),
                        new vscode.Position(line_id, close_bracket_ind + 1)
                    );

                    const type = line.substring(slash_ind + 2, open_bracket_ind).trim();
                    const base_url = `http://lsit.pl`;
                    let link = `${base_url}${line.substring(open_bracket_ind + 1, close_bracket_ind)}`;
                    link = link.replace("{ADMIN}", "/admin/");

                    const myContent = new vscode.MarkdownString(`**Open in a browser:**\n\n [${link}](${link})\n\n**Documentation**\n\n[https://piep.bit.ai/docs/view/UifbMg9cXMw29jkU](https://piep.bit.ai/docs/view/UifbMg9cXMw29jkU)`);
                    myContent.isTrusted = true;

                    let decoration: vscode.DecorationOptions = { range, hoverMessage: myContent };

                    annotation_decorations.push(decoration);
                }
            }
        }

        if (IS_JS) {
            const match_exclude_start = line.match(/\/\/.*exclude start/);
            if (match_exclude_start) {
                exclude_start_line = line_id;
            }
            else if (exclude_start_line !== null) {
                const match_exclude_end = line.match(/\/\/.*exclude end/);

                if (match_exclude_end) {
                    let range = new vscode.Range(
                        new vscode.Position(exclude_start_line, 0),
                        new vscode.Position(line_id + 1, 0)
                    );

                    const myContent = new vscode.MarkdownString(`This part of code will be excluded by the backend compiler\n\nWhen to use it? For example for type hinting classes like PiepNode`);
                    let decoration: vscode.DecorationOptions = { range, hoverMessage: myContent };

                    exclude_decorations.push(decoration);

                    exclude_start_line = null;
                }
            }
        }
    }

    editor.setDecorations(decorate_entity, entity_decorations);
    editor.setDecorations(decorate_annotation, annotation_decorations);
    editor.setDecorations(decorate_expression, expression_decorations);
    editor.setDecorations(docorate_exclude, exclude_decorations);


    console.log("Set decorations");
}

function deepMerge(...sources: any) {
    let acc: any = {};
    for (const source of sources) {
        if (source instanceof Array) {
            if (!(acc instanceof Array)) {
                acc = [];
            }
            acc = [...acc, ...source];
        } else if (source instanceof Object) {
            for (let [key, value] of Object.entries(source)) {
                if (value instanceof Object && key in acc) {
                    value = deepMerge(acc[key], value);
                }
                acc = { ...acc, [key]: value };
            }
        }
    }
    return acc;
}

function cloneObject(obj: any) {
    var clone: any = {};
    for (var i in obj) {
        if (obj[i] != null && typeof (obj[i]) == "object")
            clone[i] = cloneObject(obj[i]);
        else
            clone[i] = obj[i];
    }
    return clone;
}
