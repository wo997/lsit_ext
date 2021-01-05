// @ts-check

import * as vscode from "vscode";
import * as fs from 'fs';
import * as php from './php';
import * as js from './js';
import * as util from "./util";

const window = vscode.window;

export interface FileData {
    typedefs?: php.TypeDef[]
    functions?: php.Function[]
}

// store some data under each file's path
export let files_data: any = {};
export let php_type_defs: any = {};
export let php_functions: any = {};
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
    color: '#5897d1'
});

export const decorate_annotation_data_type = vscode.window.createTextEditorDecorationType({
    color: '#3ac9a3'
});

export const decorate_error = vscode.window.createTextEditorDecorationType({
    /*textDecoration: "underline red",*/
    backgroundColor: '#f003'
});

export const decorate_typedef_property_name = vscode.window.createTextEditorDecorationType({
    color: '#999'
});

export const decorate_typedef_data_type = vscode.window.createTextEditorDecorationType({
    color: '#ccc'
});

export const decorate_curly_braces = vscode.window.createTextEditorDecorationType({
    color: '#ccc'
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

    context.subscriptions.push(provider, disposable);

    if (vscode.window.activeTextEditor) {
        decorateActiveEditor(vscode.window.activeTextEditor.document.uri);
    }
}

function updateFile(file_path: string) {
    try {
        file_path = filePathClean(file_path);
        const sourceCode = fs.readFileSync(file_path, "utf-8");

        if (file_path.endsWith(".php")) {
            const file_data = php.getFileMetadata(sourceCode);
            if (file_data && file_data?.typedefs?.length) {
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
                updateFile(file_path);
            }
        });

        return entity_data_files_sub;
    }

    files_data = {};
    scanFilesInDir(project_root);
    filesUpdated();
}

function filesUpdated() {
    //console.log("files_data", files_data);

    let temp_php_type_defs: any = {};

    let temp_php_functions: any = {};

    // @ts-ignore
    Object.values(files_data).forEach((file_data: FileData) => {
        file_data.typedefs?.forEach((file_type_def: php.TypeDef) => {
            let type_def: php.TypeDef = temp_php_type_defs[file_type_def.name];
            if (!type_def) {
                type_def = {
                    name: file_type_def.name,
                    properties: {}
                };
                temp_php_type_defs[type_def.name] = type_def;
            }
            util.deepAssign(type_def.properties, file_type_def.properties);
        });

        file_data.functions?.forEach((file_function: php.Function) => {
            const function_def: php.Function = {
                name: file_function.name,
                args: file_function.args,
            }
            temp_php_functions[file_function.name] = function_def;
        });
    });

    php_type_defs = temp_php_type_defs;
    php_functions = temp_php_functions;
    //console.log("php_type_defs", php_type_defs);
    console.log("php_functions", php_functions);
}

function watchFiles() {
    const watcher: vscode.FileSystemWatcher = vscode.workspace.createFileSystemWatcher("**/*.php"); //glob search string

    const anyFilechange = (uri: vscode.Uri) => {
        const file_path = filePathClean(uri.path);
        updateFile(file_path);

        filesUpdated();

        vscode.window.showInformationMessage("LSIT indexed changes in " + file_path);
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

    IS_JS = document.uri.path.endsWith(".js");
    IS_PHP = document.uri.path.endsWith(".php");

    const sourceCode = document.getText();

    let exclude_decorations: vscode.DecorationOptions[] = [];

    //const sourceCodeArr = sourceCode.split('\n');

    visibleRanges = vscode.window.activeTextEditor?.visibleRanges;

    if (visibleRanges && visibleRanges[0]) {
        if (IS_PHP) {
            php.decorateFile(sourceCode, editor);
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