// @ts-check

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as fs from 'fs';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

let entity_data_files: any = {};
let entity_definitions: any = {};

interface file_data {
    entity_name: any,
    entity_definition: any,
}

export function activate(context: vscode.ExtensionContext) {
    const vscode = require("vscode");

    IndexFiles();

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

    let disposable = vscode.commands.registerCommand(
        "lsit.helloWorld",
        () => {
            const window = vscode.window;
            const editor = window.activeTextEditor;

            if (!editor) {
                window.showInformationMessage("Editor doesn't exist");
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

    const provider = vscode.languages.registerCompletionItemProvider(
        'php',
        {
            provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
                const linePrefix = document.lineAt(position).text.substr(0, position.character);
                if (!linePrefix.endsWith('["')) {
                    return undefined;
                }
                const last_dollar = linePrefix.lastIndexOf("$");
                const var_name = linePrefix.substring(last_dollar + 1, position.character - 2);

                const entity_data = entity_definitions[var_name];

                if (!entity_data) {
                    return undefined;
                }

                let suggestions: any = [];
                Object.entries(entity_data.properties).forEach(([property_name, property_data]) => {
                    suggestions.push(new vscode.CompletionItem(property_name, vscode.CompletionItemKind.Property));
                });
                return suggestions;
            }
        },
        '"' // triggered whenever a '"' is being typed
    );

    context.subscriptions.push(provider, disposable);
}

// this method is called when your extension is deactivated
export function deactivate() { }

function updateDefiniton(entity_name: string) {
    const entity_definition = {};

    Object.entries(entity_data_files).forEach(([file_path, file_data]: any) => {
        if (!file_data || file_data.entity_name !== entity_name) {
            return;
        }
        // TODO: it's a place where you want to merge props and methods maybe
        Object.assign(entity_definition, file_data.entity_definition);
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
function IndexFiles() {
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
