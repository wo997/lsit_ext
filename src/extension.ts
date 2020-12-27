// @ts-check

import * as vscode from "vscode";
import * as fs from 'fs';
import { cloneObject, deepAssign } from './util';
import { scanFilePHP, getCompletionItemsPHP } from './php';
import { scanFileJS } from './js';

const window = vscode.window;

export let entity_data_files: any = {};
export let entity_definitions: any = {};
let code_data_in_current_editor: any = {};
export let visibleRanges: vscode.Range[] | undefined = undefined;
export let textChangeEventTimeout: any = null;

let IS_JS = false;
let IS_PHP = false;

interface file_data {
    entity_name: any,
    entity_definition: any,
}

export const decorate_wo997_annotation = vscode.window.createTextEditorDecorationType({
    color: '#a3c',
    fontWeight: 'bold',
    /*fontWeight: 'bold',
    fontStyle: 'italic',
    backgroundColor: '#005'*/
});

export const decorate_entity = vscode.window.createTextEditorDecorationType({
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

export const decorate_annotation_type = vscode.window.createTextEditorDecorationType({
    color: '#2566c8'
});

export const decorate_annotation_data_type = vscode.window.createTextEditorDecorationType({
    color: '#3ac9a3'
});

export const decorate_error = vscode.window.createTextEditorDecorationType({
    /*textDecoration: "underline red",*/
    backgroundColor: '#f003'
});

// replaced with php parser yay
//const match_entities_regex = /(?<=\[("))([\w^_])*(?=(__\w*"\]))|(?<=\$)([\w^_])*(?=(__\w*\["))/g;
//const match_entities_regex = /(?<=(\[))"([\w^_])*__\w*"(?=(\]))|(?<=)\$([\w^_])*__\w*/g;

export let workspace_path = "";

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

        console.log("IS_PHP", IS_PHP);
        if (IS_PHP) {
            return getCompletionItemsPHP(document, position, linePrefix);
        }

        return undefined;
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

function entityFound(entity_name: string) {
    const entity_data = entity_definitions[entity_name];
    if (!entity_data || !entity_data.properties) {
        return undefined;
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
        entity_definition = deepAssign(entity_definition, file_data.entity_definition);
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

export function filePathClean(file_path: string): string {
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

export function extractEntityName(str: string) {
    const matches = str.match(/\w*__/);
    if (matches) {
        const match = matches[0];
        return match.substr(0, match.length - 2);
    }
    return "";
}

export function getEntityInCodeObj(loc: any, entity_name: string) {
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

    IS_JS = document.uri.path.endsWith(".js");
    IS_PHP = document.uri.path.endsWith(".php");

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


    visibleRanges = vscode.window.activeTextEditor?.visibleRanges;



    if (visibleRanges && visibleRanges[0]) {
        if (IS_PHP) {
            scanFilePHP(editor, sourceCode, sourceCodeArr);
        }
        if (IS_JS) {
            scanFileJS(editor, sourceCode, sourceCodeArr);
        }
    }

    const sourceCodeArrLen = sourceCodeArr.length;
    let exclude_start_line = null;
    for (let line_id = 0; line_id < sourceCodeArrLen; line_id++) {
        const line = sourceCodeArr[line_id];

        if (line_id === 0) {
            if (IS_PHP) {

            }
        }

        if (IS_JS) {
            /* these are not used currently ;) */
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

    //editor.setDecorations(decorate_entity, entity_decorations);
    //editor.setDecorations(decorate_wo997_annotation, annotation_decorations);
    //editor.setDecorations(decorate_expression, expression_decorations);
    //editor.setDecorations(docorate_exclude, exclude_decorations);


    console.log("Set decorations");
}

