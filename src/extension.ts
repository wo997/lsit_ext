// @ts-check

import * as vscode from "vscode";
import * as fs from 'fs';

const window = vscode.window;

let entity_data_files: any = {};
let entity_definitions: any = {};

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

//const match_entities_regex = /(?<=\[("))([\w^_])*(?=(__\w*"\]))|(?<=\$)([\w^_])*(?=(__\w*\["))/g;
const match_entities_regex = /(?<=(\[))"([\w^_])*__\w*"(?=(\]))|(?<=)\$([\w^_])*__\w*(?=(\["))/g;

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

    const provider = vscode.languages.registerCompletionItemProvider(
        'php',
        {
            provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
                const linePrefix = document.lineAt(position).text.substr(0, position.character);

                if (linePrefix.endsWith('["')) {
                    const matches = linePrefix.match(match_entities_regex);

                    if (matches) {
                        const entity_name = extractEntityName(matches[matches.length - 1]);

                        return entityFound(entity_name);
                    }
                }
                return noEntityFound();
            }
        },
        '"' // triggered whenever a '"' is being typed
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

        if (window.activeTextEditor?.document == event.document) {
            decorate(event.document);
        }
    });

    vscode.workspace.onDidOpenTextDocument(document => {
        //console.log(`Did open: ${document.uri}`);

        decorate(document);
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


function decorate(document: vscode.TextDocument) {

    const editor = window.activeTextEditor;

    if (!editor) {
        return;
    }

    let sourceCode = document.getText();

    let annotation_decorations: vscode.DecorationOptions[] = [];
    let entity_decorations: vscode.DecorationOptions[] = [];

    const sourceCodeArr = sourceCode.split('\n');

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

                const myContent = new vscode.MarkdownString(`hey, nice ${type} baby!\n\n hehe [link](${link})`);
                myContent.isTrusted = true;

                let decoration: vscode.DecorationOptions = { range, hoverMessage: myContent };

                annotation_decorations.push(decoration);
            }
        }


        const match_entities = line.match(match_entities_regex);

        if (match_entities) {
            for (const entity_match of match_entities) {
                const entity_name = extractEntityName(entity_match);

                const start_ind = line.indexOf(entity_match);

                let range = new vscode.Range(
                    new vscode.Position(line_id, start_ind),
                    new vscode.Position(line_id, start_ind + entity_match.length)
                );

                const reference_files = Object.entries(entity_data_files).filter(([file, data]): any => {
                    return data.entity_name === entity_name;
                }).map(e => {
                    return e[0];
                });

                if (reference_files.length > 0) {
                    const reference_files_string = reference_files.map(e => { return `[${e.replace(filePathClean(workspace_path), '')}](/${e})` }).join("\n\n");

                    let definition_pretty_string = "";
                    const entity_definition = entity_definitions[entity_name];
                    const entity_properties = Object.keys(entity_definition.properties);
                    if (entity_properties.length > 0) {
                        definition_pretty_string += "\n\n\n\n**Properties:**" + entity_properties.map(e => { return "\n\n• " + e }).join("");
                    }

                    //const definition_pretty_string = JSON.stringify(, null, 2).replace(/\n/g, "\n\n").replace(/\n\n\n\n/g, "\n\n");
                    //console.log(definition_pretty_string);
                    const myContent = new vscode.MarkdownString(`**Entity name:**\n\n\n\n${entity_name}${definition_pretty_string}\n\n\n\n**See definitions:**\n\n${reference_files_string}`);
                    myContent.isTrusted = true;

                    let decoration: vscode.DecorationOptions = { range, hoverMessage: myContent };

                    entity_decorations.push(decoration);
                }
            }
        }
    }

    editor.setDecorations(decorate_entity, entity_decorations);
    editor.setDecorations(decorate_annotation, annotation_decorations);
}