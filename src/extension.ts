// @ts-check

import * as vscode from "vscode";
import * as fs from 'fs';
import * as php from './php';
import * as js from './js';
import * as util from "./util";

const window = vscode.window;

export let phpDiagnosticCollection: vscode.DiagnosticCollection;

export interface FileData {
    typedefs?: php.TypeDef[]
    scopes?: php.FileScopes
}

// store some data under each file's path
export let files_data: any = {};
export let php_type_defs: any = {};
export let php_entity_names_as_prop: any = {};
export let php_table_names_as_prop: any = {};
export let php_scopes: php.FileScopes = {
    global: {
        functions: new Map()
    },
    classes: new Map()
};
export let visibleRanges: vscode.Range[] | undefined = undefined;
export let textChangeEventTimeout: any = null;

let IS_JS = false;
let IS_PHP = false;

export const decorate_wo997_annotation = vscode.window.createTextEditorDecorationType({
    color: '#a3c',
    fontWeight: 'bold',
    /*fontWeight: 'bold',
    fontStyle: 'italic',
    backgroundColor: '#005'*/
});

export const decorate_entity = vscode.window.createTextEditorDecorationType({
    // /*color: '#44e',
    // fontWeight: 'bold',*/
    // fontWeight: 'bold',
    // //fontStyle: 'italic',
    // //"outline": "2px solid red",
    // //"border": "2px solid #fff2",
    // //border: "1px solid #fff2",
    // //backgroundColor: '#0004',
    // backgroundColor: '#0581',
    // border: '2px solid #0583',
    // borderRadius: '2px',
    // //textDecoration: "underline",
    // /*backgroundColor: '#024'*/
});

const decorate_expression = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'green'
});

const docorate_exclude = vscode.window.createTextEditorDecorationType({
    backgroundColor: '#f002'
});

export const decorate_annotation_type = vscode.window.createTextEditorDecorationType({
    color: '#5897d1'
});

export const decorate_annotation_data_type = vscode.window.createTextEditorDecorationType({
    color: '#3ac9a3'
});

// export const decorate_error = vscode.window.createTextEditorDecorationType({
//     /*textDecoration: "underline red",*/
//     backgroundColor: '#f003'
// });

export const decorate_typedef_prop_name = vscode.window.createTextEditorDecorationType({
    color: '#999'
});

export const decorate_typedef_data_type = vscode.window.createTextEditorDecorationType({
    color: '#ccc'
});

export const decorate_curly_braces = vscode.window.createTextEditorDecorationType({
    color: '#ccc'
});

export const decorate_params = vscode.window.createTextEditorDecorationType({
    color: '#3ac88f'
});

export const decorate_modifiers = vscode.window.createTextEditorDecorationType({
    color: '#f56c1d',
});

export let workspace_path = "";

export function activate(context: vscode.ExtensionContext) {
    if (vscode.workspace.workspaceFolders) {
        workspace_path = vscode.workspace.workspaceFolders[0].uri.path;
    }

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

    context.subscriptions.push(disposable);


    const provideCompletionItems = (document: vscode.TextDocument, position: vscode.Position) => {
        const linePrefix = document.lineAt(position).text.substr(0, position.character);

        //console.log("IS_PHP", IS_PHP);
        if (IS_PHP) {
            return php.getCompletionItems(document, position, linePrefix);
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

    context.subscriptions.push(provider);

    phpDiagnosticCollection = vscode.languages.createDiagnosticCollection('php');
    context.subscriptions.push(phpDiagnosticCollection);

    // needs to run twice, read defs, then find errors
    // phpDiagnosticCollection must be instantiated
    indexFiles();
    indexFiles();

    if (vscode.window.activeTextEditor) {
        decorateActiveEditor(vscode.window.activeTextEditor.document.uri);
    }
}

function getFileData(file_path: string) {
    return fs.readFileSync(filePathClean(file_path), "utf-8");
}

function updateFile(file_path: string) {
    try {
        const sourceCode = getFileData(file_path);

        if (file_path.endsWith(".php")) {
            const file_data = php.getFileMetadata(sourceCode, file_path);
            if (file_data) { // && (file_data.typedefs?.length || file_data.functions?.length)) {
                files_data[file_path] = file_data;
                //console.log("============ " + file_path, file_data);
            } else {
                delete files_data[file_path];
                //console.log("D " + file_path);
            }
        }
    }
    catch (e) { }
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

    const scanFilesInDir: any = (dir: string) => {
        let entity_data_files_sub: any = {};
        let table_data_files_sub: any = {};
        fs.readdirSync(filePathClean(dir), { withFileTypes: true }).forEach(file => {
            const file_path = `${dir}/${file.name}`;

            if (file.isDirectory()) {
                if (file.name.charAt(0) == "." || ["vendor", "builds", "prebuilds", "settings", "uploads"].includes(file.name)) {
                    return;
                }
                const res = scanFilesInDir(file_path);
                Object.assign(entity_data_files_sub, res.entity_data_files_sub);
                Object.assign(table_data_files_sub, res.table_data_files_sub);
            } else {
                updateFile(file_path);
            }
        });

        return { entity_data_files_sub, table_data_files_sub };
    }

    files_data = {};
    scanFilesInDir(workspace_path);
    filesUpdated();
}

function filesUpdated() {
    //console.log("files_data", files_data);

    let temp_php_type_defs: any = {};
    let temp_php_entity_names_as_prop: any = {};
    let temp_php_table_names_as_prop: any = {};

    let temp_php_scopes: php.FileScopes = {
        global: {
            functions: {}
        },
        classes: {}
    };

    // @ts-ignore
    Object.values(files_data).forEach((file_data: FileData) => {
        file_data.typedefs?.forEach((file_type_def: php.TypeDef) => {
            let type_def: php.TypeDef = temp_php_type_defs[file_type_def.name];
            if (!type_def) {
                type_def = {
                    name: file_type_def.name,
                    props: {}
                };
                temp_php_type_defs[type_def.name] = type_def;
            }
            util.deepAssign(type_def.props, file_type_def.props);

            if (type_def.name.startsWith("Entity")) {
                temp_php_entity_names_as_prop[util.camelToSnakeCase(type_def.name.substring("Entity".length))] = { data_type: "string" };
            }
            if (type_def.name.startsWith("Table")) {
                temp_php_table_names_as_prop[util.camelToSnakeCase(type_def.name.substring("Table".length))] = { data_type: "string" };
            }
        });

        util.deepAssign(temp_php_scopes, file_data.scopes);
    });

    php_entity_names_as_prop = temp_php_entity_names_as_prop;
    php_table_names_as_prop = temp_php_table_names_as_prop;
    php_type_defs = temp_php_type_defs;
    php_scopes = temp_php_scopes;
    // console.log("php_type_defs", php_type_defs);
    // console.log("php_scopes", php_scopes);
}

function watchFiles() {
    const watcher: vscode.FileSystemWatcher = vscode.workspace.createFileSystemWatcher("**/*.php"); //glob search string

    const anyFilechange = (uri: vscode.Uri) => {
        updateFile(uri.path);

        filesUpdated();

        //vscode.window.showInformationMessage("LSIT indexed changes in " + uri.path);
    }
    watcher.onDidCreate(anyFilechange);
    watcher.onDidChange(anyFilechange);
    watcher.onDidDelete(anyFilechange);
}

function initSyntaxDecorator() {
    vscode.workspace.onDidChangeTextDocument(event => {
        console.log(`Did change: ${event.document.uri}`, event);

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

function decorateActiveEditor(uri: vscode.Uri) {
    const editor = vscode.window.activeTextEditor;
    if (!editor?.document || editor.document.uri !== uri) {
        return;
    }

    const document = editor.document;

    IS_JS = uri.path.endsWith(".js");
    IS_PHP = uri.path.endsWith(".php");

    const sourceCode = document.getText();

    //let exclude_decorations: vscode.DecorationOptions[] = [];

    //const sourceCodeArr = sourceCode.split('\n');

    visibleRanges = vscode.window.activeTextEditor?.visibleRanges;

    if (visibleRanges && visibleRanges[0]) {
        if (IS_PHP) {
            const file_data = php.decorateFile(sourceCode, editor, uri.path);
            if (file_data && !util.isEquivalent(files_data[uri.path], file_data)) {
                files_data[uri.path] = file_data;
                filesUpdated();
            }
        }
        if (IS_JS) {
            //js.scanFile(editor, sourceCode);
        }
    }

    //const sourceCodeArrLen = sourceCodeArr.length;
    //let exclude_start_line = null;
    /*for (let line_id = 0; line_id < sourceCodeArrLen; line_id++) {
        const line = sourceCodeArr[line_id];

        if (line_id === 0) {
            if (IS_PHP) {

            }
        }

        if (IS_JS) {
            // these are not used currently ;)
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
    }*/
}

// this method is called when your extension is deactivated
export function deactivate() { }