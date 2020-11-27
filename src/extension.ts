// @ts-check

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    const vscode = require("vscode");

    let disposable = vscode.commands.registerCommand(
        "lsit.helloWorld",
        () => {
            const window = vscode.window;
            const editor = window.activeTextEditor;

            if (!editor) {
                window.showInformationMessage("Editor doesn't exist");
            }

            const text = editor.document.getText(editor.selection);

            //vscode.window.showInformationMessage("Hello World from piep!" + text + JSON.stringify(editor.document.lineAt(editor.selection.start.line)));

            //{"_line":10,"_text":"$rating_data = fetchRow(\"SELECT AVG(rating) as avg, COUNT(rating) as count FROM comments","_isLastLine":false}

            /*const selection = new vscode.Selection();
            {start:
            }
            editor.document.getText(editor.selection.start.line);

            const active_line = editor.selection.active.line;*/

            /* {"start":{"line":10,"character":24},"end":{"line":10,"character":28},"active":{"line":10,"character":28},"anchor":{"line":10,"character":24}} */

            /*const entity_name = await vscode.window.showInputBox({
                placeHolder: "Name Your GistTest",

            });*/

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
                console.log(linePrefix);
                if (!linePrefix.endsWith('product["')) {
                    return undefined;
                }

                // TODO: entity scanning ezy

                return [
                    new vscode.CompletionItem('title', vscode.CompletionItemKind.Property),
                    new vscode.CompletionItem('category_ids', vscode.CompletionItemKind.Property),
                    new vscode.CompletionItem('price_min', vscode.CompletionItemKind.Property),
                ];
            }
        },
        '"' // triggered whenever a '.' is being typed
    );

    context.subscriptions.push(provider, disposable);
}

// this method is called when your extension is deactivated
export function deactivate() { }
