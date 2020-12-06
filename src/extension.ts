// @ts-check

import * as vscode from "vscode";
import * as fs from 'fs';

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
let code_parts_with_entity_in_current_editor: any = {};

interface file_data {
    entity_name: any,
    entity_definition: any,
}

const decorate_annotation = vscode.window.createTextEditorDecorationType({
    color: '#c3a',
    fontWeight: 'bold',
});

const decorate_entity = vscode.window.createTextEditorDecorationType({
    color: '#44e',
    fontWeight: 'bold',
});

const decorate_expression = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'green'
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

        //console.log(linePrefix);
        const entity_name_index = linePrefix.lastIndexOf("__");
        if (entity_name_index !== -1) {
            for (const code_part_data of code_parts_with_entity_in_current_editor) {
                if (code_part_data.loc.start.line - 1 === position.line && code_part_data.loc.start.column <= entity_name_index && code_part_data.loc.end.column >= entity_name_index) {
                    const start_index = entity_name_index + 2;
                    const match = linePrefix.substr(start_index).match(/\w*(["']\])?\[["']\w*/);
                    //console.log(match, linePrefix, linePrefix.substr(start_index));
                    if (match && match[0] && match[0].length === linePrefix.length - start_index) {
                        return code_part_data.entity.suggestions;
                    }
                }
                //console.log(code_part_data);
            }


            //console.log("code_parts_with_entity_in_current_editor", code_parts_with_entity_in_current_editor);
            /*for (const code_part_data of code_parts_with_entity_in_current_editor) {
                if (code_part_data.loc.start.line - 1 === position.line && code_part_data.loc.start.column <= entity_name_index && code_part_data.loc.end.column >= entity_name_index) {
                    return code_part_data.entity.suggestions;
                }
                //console.log(code_part_data);
            }*/
        }

        /*if (linePrefix.endsWith('["')) {
            const matches = linePrefix.match(match_entities_regex);

            if (matches) {
                const entity_name = extractEntityName(matches[matches.length - 1]);

                return entityFound(entity_name);
            }
        }*/
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
        //console.log(`Did change: ${event.document.uri}`);

        decorateActiveEditor();
    });

    vscode.window.onDidChangeActiveTextEditor(event => {

        //console.log("heheh", event);
        decorateActiveEditor();
    })
    vscode.workspace.onDidOpenTextDocument(document => {
        //console.log(`Did open: ${document.uri}`);

        decorateActiveEditor();
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

function parseCodePart(code_part: any): Array<any> {
    let code_data: Array<any> = [];

    //console.log(code_part, code_part.kind);
    if (code_part.kind === "program") {
        code_data = parseProgram(code_part);
    } else if (code_part.kind === "function") {
        code_data = parseFunction(code_part);
    } else if (code_part.kind === "expressionstatement") {
        code_data = parseExpressionStatement(code_part);
    } else if (code_part.kind === "echo") {
        code_data = parseExpressions(code_part);
    } else if (code_part.kind === "offsetlookup") {
        code_data = parseOffestLookup(code_part);
    } else if (code_part.kind === "variable") {
        code_data = parseVariable(code_part);
    }

    return code_data;
}

function getCodePartChildrenData(children: any): Array<any> {
    let code_data: Array<any> = [];

    if (children) {
        for (const sub_code_part of children) {
            const sub_code_data = parseCodePart(sub_code_part);
            code_data.push(...sub_code_data);
        }
    }

    return code_data;
}

function parseProgram(code_part: any): Array<any> {
    let code_data: Array<any> = [];

    code_data.push(...getCodePartChildrenData(code_part.children));

    return code_data;
}

function parseFunction(code_part: any): Array<any> {
    let code_data: Array<any> = [];

    console.log(code_part.body);
    code_data.push(...getCodePartChildrenData(code_part.body.children));

    return code_data;
}

function parseExpressionStatement(code_part: any): Array<any> {
    let code_data: Array<any> = [];

    if (code_part.expression) {
        switch (code_part.expression.kind) {
            case "call":
                //console.log("call", code_part);
                // code_part.expression.what
                // TODO: this is important AF!!!
                // you wanna add a support for interfaces in functions and more probably,
                // so an object can be passed, not just a few args that are clearly limiting developement
                for (const sub_code_part of code_part.expression.arguments) {
                    code_data.push(...parseExpression(sub_code_part));
                }
                break;
            case "assign":
                code_data.push(...parseExpression(code_part.expression.left));
                code_data.push(...parseExpression(code_part.expression.right));
                //console.log("assign", code_part);
                break;
        }
    }

    return code_data;
}

function parseExpressions(code_part: any): Array<any> {
    let code_data: Array<any> = [];

    for (const expression of code_part.expressions) {
        code_data.push(...parseExpression(expression));
    }

    return code_data;
}

function parseExpression(code_part: any): Array<any> {
    let code_data: Array<any> = [];

    //console.log("357_code_part", code_part);
    const loc = code_part.loc;

    // nobody cares
    /*code_data.push({
        type: "expression",
        loc: loc
    });*/

    code_data.push(...parseCodePart(code_part));


    return code_data;
}

function parseVariable(code_part: any): Array<any> {
    let code_data: Array<any> = [];

    const entity_name = extractEntityName(code_part.name);
    if (entity_name) {
        code_data.push(getEntityInCodeObj(code_part.loc, entity_name));
    }

    return code_data;
}

function parseOffestLookup(code_part: any): Array<any> {
    let code_data: Array<any> = [];

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
                code_data.push(getEntityInCodeObj(name_obj.loc, entity_name));
            }
        }
    }

    return code_data;
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

function decorateActiveEditor() {
    const editor = vscode.window.activeTextEditor;
    if (!editor?.document) {
        return;
    }

    const document = editor.document;

    const sourceCode = document.getText();

    let annotation_decorations: vscode.DecorationOptions[] = [];
    let entity_decorations: vscode.DecorationOptions[] = [];
    let expression_decorations: vscode.DecorationOptions[] = [];

    const sourceCodeArr = sourceCode.split('\n');

    let temp_code_parts_with_entity_in_current_editor = [];

    if (document.uri.path.endsWith(".php")) {
        const php_parsed = php_parser.parseCode(sourceCode);
        //console.log("xxx", php_parsed);

        //console.log("await_code_data");

        const code_data = parseCodePart(php_parsed);

        //console.log("code_data", code_data);

        for (const code_part_data of code_data) {
            const loc = code_part_data.loc;

            let range = new vscode.Range(
                new vscode.Position(loc.start.line - 1, loc.start.column),
                new vscode.Position(loc.end.line - 1, loc.end.column),
            );

            if (code_part_data.entity) {
                const entity_name = code_part_data.entity.name;

                temp_code_parts_with_entity_in_current_editor.push(code_part_data);
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
        }
    }

    code_parts_with_entity_in_current_editor = temp_code_parts_with_entity_in_current_editor;

    const sourceCodeArrLen = sourceCodeArr.length;
    for (let line_id = 0; line_id < sourceCodeArrLen; line_id++) {
        const line = sourceCodeArr[line_id];
        if (line_id === 0) {
            // TODO: just php ;)
            const match_annotation = line.match(/(<\?php \/\/.*\[.*\])/);

            if (match_annotation !== null) {
                const slash_ind = line.indexOf("//");
                const open_bracket_ind = line.indexOf("[");
                const close_bracket_ind = line.indexOf("]");

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

    editor.setDecorations(decorate_entity, entity_decorations);
    editor.setDecorations(decorate_annotation, annotation_decorations);
    editor.setDecorations(decorate_expression, expression_decorations);
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
