import * as vscode from "vscode";
import { Program, Block } from 'php-parser';
import { cloneObject, deepAssign } from './util';
import * as ext from './extension';



const engine = require('php-parser');
// initialize a new parser instance
const php_parser = new engine({
    parser: {
        extractDoc: true,
        php7: true,
        locations: true,
        suppressErrors: true,
    },
    ast: {
        withPositions: true
    }
});

//let code_data_in_current_editor: any = {};
//let temp_code_data: any = [];

let code_decorations: any = [];
let temp_decorations: any = {};

//let php_parsed: any;
let interesting_code_parts: any;
let temp_interesting_code_parts: any;

export function getCompletionItemsPHP(document: vscode.TextDocument, position: vscode.Position, linePrefix: string): vscode.CompletionItem[] | undefined {
    //console.log("!!!!!!!!!!!!===", interesting_code_parts);
    /*for (const a of interesting_code_parts) {
        console.log(a.kind);
    }
    return;*/

    for (const code_part of interesting_code_parts) {
        //console.log("test", code_part.entry, "p1", code_part.loc.start, "p2", position, code_part.loc.start.column <= position.character, code_part.loc.end.column >= position.character);
        //console.log("CIPSADASDASDFASDFASDFASDFasdf", code_part.kind, "&&", code_part.possible_properties, "&&", code_part.loc.start.line - 1, "===", position.line, "&&", code_part.loc.start.column, "<=", position.character, "&&", code_part.loc.end.column, ">=", position.character);
        if (code_part.kind === "string" && code_part.possible_properties && code_part.loc.start.line - 1 === position.line && code_part.loc.start.column <= position.character && code_part.loc.end.column >= position.character) {
            //console.log("0000000000000000000000000000", code_part.possible_properties);
            //return;

            let suggestions: any = [];
            Object.entries(code_part.possible_properties).forEach(([property_name, property_data]: [any, any]) => {
                const completion_item = new vscode.CompletionItem(property_name, vscode.CompletionItemKind.Property)
                if (property_data.data_type) {
                    completion_item.detail = property_data.data_type;
                }

                if (property_data.description) {
                    completion_item.documentation = property_data.description;
                }
                suggestions.push(completion_item);
            });
            return suggestions;
        }
    }

    return undefined;
    // // spot entity by __
    // const entity_name_index = linePrefix.lastIndexOf("__");
    // if (entity_name_index !== -1) {
    //     for (const code_part_data of code_data_in_current_editor) {
    //         if (code_part_data.entity && code_part_data.loc.start.line - 1 === position.line && code_part_data.loc.start.column <= entity_name_index && code_part_data.loc.end.column >= entity_name_index) {
    //             const start_index = entity_name_index + 2;
    //             const match = linePrefix.substr(start_index).match(/\w*(["']\])?\[["']\w*/);
    //             if (match && match[0] && match[0].length === linePrefix.length - start_index) {
    //                 return code_part_data.entity.suggestions;
    //             }
    //         }
    //     }
    // }

    // // spot function argument
    // for (const code_part_data of code_data_in_current_editor) {
    //     //console.log("test", code_part_data.entry, "p1", code_part_data.loc.start, "p2", position, code_part_data.loc.start.column <= position.character, code_part_data.loc.end.column >= position.character);
    //     if (code_part_data.entry && code_part_data.entry.entity && code_part_data.loc.start.line - 1 === position.line && code_part_data.loc.start.column <= position.character && code_part_data.loc.end.column >= position.character) {
    //         let entity_name = code_part_data.entry.entity.name;

    //         //console.log("omw", code_part_data, { entity_name });

    //         const entity_data = entity_definitions[entity_name];
    //         //console.log({ entity_data });
    //         if (!entity_data || !entity_data.properties) {
    //             continue;
    //         }

    //         let suggestions: any = [];
    //         Object.entries(entity_data.properties).forEach(([property_name, property_data]: [any, any]) => {

    //             const completion_item = new vscode.CompletionItem(property_name, vscode.CompletionItemKind.Property)
    //             if (property_data.type) {
    //                 completion_item.detail = property_data.type;
    //             }
    //             // TODO: greeeeeat, we can cleanup single line of code 
    //             /*completion_item.command = {
    //                 title: "aaa",
    //                 command: "",
    //             };*/

    //             if (property_data.description) {
    //                 completion_item.documentation = property_data.description;
    //             }
    //             suggestions.push(completion_item);
    //         });
    //         return suggestions;

    //         //console.log("love");
    //     }
    // }

    // return undefined;
}

const data_type_data_arr: any = {
    Cat: {
        properties: {
            age: {
                data_type: "CatAge",
                description: "this is the age of a cat"
            },
            name: {
                data_type: "string",
                optional: true,
                description: "this is the name of a cat"
            }
        }
    },
    CatAge: {
        properties: {
            value: {
                data_type: "number",
                description: "actual age value"
            }
        }
    }
};

function createScope(code_part: any) {
    code_part.scope = {
        variables: {}
    };
};

function assignScope(code_part: any, parent_code_part: any) {
    code_part.scope = parent_code_part.scope;
    code_part.parent_code_part = parent_code_part;
    code_part.level = parent_code_part.level + 1;
    //code_part.buffer = cloneObject(parent_code_part.buffer);
};

function assignDataType(code_part: any, data_type: string, options: any = {}) {
    //console.log("!!!!!!!!!!assigning " + data_type + " to ", code_part);

    code_part.data_type = data_type;
    const data_type_data = data_type_data_arr[data_type];
    if (data_type_data) {
        code_part.data_type_data = data_type_data;
    }

    const hoverable = options.hoverable;
    code_part.hoverable = hoverable !== undefined ? hoverable : true;
}

function crawlCodePart(code_part: any) {
    /*if (!code_part.buffer) {
        code_part.buffer = {};
    }*/
    if (!code_part.level) {
        code_part.level = 0;
    }

    //console.log("---" + code_part.kind, code_part, code_part.buffer);
    console.log("--".repeat(code_part.level) + code_part.kind, code_part);

    switch (code_part.kind) {
        case "program":
            {
                createScope(code_part);

                for (const child of code_part.children) {
                    //console.log("my child: ", child);

                    assignScope(child, code_part);
                    crawlCodePart(child);
                }
            }
            break;
        case "assign":
            {
                //console.log("my scope: ", code_part.scope);
            }
            break;
        case "if":
            {
                const test = code_part.test;
                const body = code_part.body;
                assignScope(test, code_part);
                assignScope(body, code_part);
                crawlCodePart(test);
                crawlCodePart(body);
            }
            break;
        case "call":
            {
                assignScope(code_part.what, code_part);
                //crawlCodePart(code_part.what);

                let args_data_types: any = [];
                if (code_part.what.name && code_part.what.name === "var_dump") {
                    args_data_types = ["Cat", "number"];
                }

                console.log(code_part.what.name, args_data_types, "XXXXXX");

                let argument_index = -1;
                for (const arg of code_part.arguments) {
                    argument_index++;

                    assignScope(arg, code_part);

                    const data_type = args_data_types[argument_index];
                    const data_type_data = data_type_data_arr[data_type];
                    if (data_type_data) {
                        assignDataType(arg, data_type);
                    }

                    crawlCodePart(arg);
                }
            }
            break;
        case "block":
            {
                for (const child of code_part.children) {
                    assignScope(child, code_part);
                    crawlCodePart(child);
                }
            }
            break;
        case "array":
            {
                const data_type = code_part.data_type;
                const data_type_data = code_part.data_type_data;
                if (data_type_data) {
                    assignDataType(code_part, data_type);

                    for (const item of code_part.items) {
                        const fake_key = item.key ? item.key : item.value;
                        if (fake_key.kind == "string") {
                            fake_key.possible_properties = data_type_data.properties;
                            temp_interesting_code_parts.push(fake_key);
                        }

                        assignScope(item, code_part);

                        if (item.key && item.key.kind === "string" && item.value) {
                            const sub_data_type_data = data_type_data.properties[item.key.value];
                            //data_type_data_arr
                            if (sub_data_type_data) {
                                assignDataType(item.value, sub_data_type_data.data_type);
                            }
                        }

                        crawlCodePart(item);
                    }
                }
            }
            break;
        case "entry":
            {
                const key = code_part.key;
                const value = code_part.value;

                assignScope(value, code_part)
                crawlCodePart(value);

                if (key) {
                    assignScope(key, code_part)
                    crawlCodePart(key);
                }
            }
            break;
        case "variable":
            {
                let data_type = code_part.data_type;
                /*console.log("VARariables", code_part.scope.variables,
                    "data_type", data_type);*/
                if (data_type) {
                    if (code_part.name) {
                        //console.log("data_type", data_type);
                        code_part.scope.variables[code_part.name] = data_type;
                        //console.log("variables", code_part.scope.variables);
                    }
                }
                else {
                    data_type = code_part.scope.variables[code_part.name];
                    //console.log("data_type", data_type);
                    if (data_type) {
                        assignDataType(code_part, data_type);
                    }
                }
            }
            break;
        case "number":
            {
                if (!code_part.data_type) {
                    assignDataType(code_part, "number");
                }
            }
            break;
        case "string":
            {
                if (!code_part.data_type) {
                    assignDataType(code_part, "string");
                }
            }
            break;
        case "while":
            {
                const body = code_part.body;
                const test = code_part.test;
                assignScope(body, code_part);
                assignScope(test, code_part);
                crawlCodePart(body);
                crawlCodePart(test);
            }
            break;
        case "bin":
            {
                const left = code_part.left;
                const right = code_part.right;
                assignScope(left, code_part);
                assignScope(right, code_part);
                crawlCodePart(left);
                crawlCodePart(right);
            }
            break;
        case "expressionstatement":
            {
                const comments = code_part.leadingComments;

                let annotation_data_type = null;

                if (comments && comments.length > 0) {
                    const last_comment = comments[comments.length - 1];
                    if (last_comment.kind === "commentblock") {
                        if (last_comment.value.match(/@type.*{.*}/)) {
                            const match_annotation_type = last_comment.value.match(/@\w*/);
                            if (match_annotation_type) {
                                const annotation_type = match_annotation_type[0];

                                const start_column = last_comment.loc.start.column + match_annotation_type.index;

                                temp_decorations.push({
                                    annotation: annotation_type,
                                    loc: {
                                        start: {
                                            line: last_comment.loc.start.line,
                                            column: start_column,
                                        },
                                        end: {
                                            line: last_comment.loc.start.line,
                                            column: start_column + annotation_type.length,
                                        }
                                    },
                                });
                            }

                            const match_annotation_data_type = last_comment.value.match(/{.*}/);
                            if (match_annotation_data_type) {
                                const data_type = match_annotation_data_type[0];
                                annotation_data_type = data_type.substring(1, data_type.length - 1);

                                const start_column = last_comment.loc.start.column + match_annotation_data_type.index;

                                temp_decorations.push({
                                    annotation_data_type: annotation_data_type,
                                    loc: {
                                        start: {
                                            line: last_comment.loc.start.line,
                                            column: start_column,
                                        },
                                        end: {
                                            line: last_comment.loc.start.line,
                                            column: start_column + data_type.length,
                                        }
                                    },
                                });
                            }
                        }
                    }
                }

                const left = code_part.expression.left;
                const right = code_part.expression.right;
                if (left && right) {
                    assignScope(left, code_part);
                    assignScope(right, code_part);
                    right.reference = left;
                    crawlCodePart(right);

                    if (annotation_data_type) {
                        //console.log(left, annotation_data_type);
                        assignDataType(left, annotation_data_type);
                    }

                    crawlCodePart(left);

                    if (left.data_type && right.data_type && left.data_type != right.data_type) {
                        console.error("Wrong assignment :P");
                        temp_decorations.push({
                            error: `Cannot assign **${right.data_type}** to **${left.data_type}**!`,
                            loc: code_part.expression.loc
                        });
                    }
                } else {
                    const expression = code_part.expression;
                    assignScope(expression, code_part);
                    crawlCodePart(expression);
                }
            }
            break;
        case "offsetlookup":
            {
                const what = code_part.what;
                const offset = code_part.offset;
                if (what && offset) {
                    assignScope(what, code_part);
                    assignScope(offset, code_part);

                    crawlCodePart(what);

                    if (what.data_type_data && what.data_type_data.properties) {
                        //console.log("GIVE PROPERTIES ", what.data_type_data.properties, "TO", offset);
                        offset.possible_properties = what.data_type_data.properties;
                        temp_interesting_code_parts.push(offset);

                        const offset_value = offset.value;
                        const offset_property = offset.possible_properties[offset_value];
                        if (offset_property) {
                            //console.log("give offset data type " + offset_property.data_type + ":", offset);
                            assignDataType(offset, offset_property.data_type);
                        }
                    }

                    crawlCodePart(offset);

                    if (offset.parent_code_part && offset.parent_code_part.kind == "offsetlookup") {
                        if (offset.data_type) {
                            //console.log("from parent data type " + offset.data_type + ":", offset);
                            assignDataType(offset.parent_code_part, offset.data_type, { hoverable: false });
                        }
                    }
                }
            }
            break;
        case "function":
            {
                createScope(code_part);

                const args = code_part.arguments;
                const body = code_part.body;
                assignScope(body, code_part);
                crawlCodePart(body);
            }
            break;


        /*
        case "echo":
            code_data_full = parseExpressions(code_data_full);
            break;
        case "class":
            code_data_full = parseClass(code_data_full);
            break;
        case "method":
            clearBufferFromVars();
            code_data_full = parseMethod(code_data_full);
            break;
        default:
            console.error("wrong code part kind");
            break;*/
    }


    if (code_part.reference) {
        if (!code_part.reference.data_type) {
            assignDataType(code_part.reference, code_part.data_type);
        }
    }

    if (code_part.data_type && code_part.hoverable) {
        temp_decorations.push({
            data_type: code_part.data_type,
            data_type_data: code_part.data_type_data,
            loc: code_part.loc,
        });
    }

    // HEY MAYBE U BETTER ADD IT IN HERE ONLY IF THE CURSOR IS INSIDE, WAY MORE EFFICIENT
    /*console.log("penis" + " " + code_part.kind);
    if (["entry"].includes(code_part.kind)) {
        temp_interesting_code_parts.push(code_part);
    }*/
}

export function scanFilePHP(editor: vscode.TextEditor, sourceCode: string, sourceCodeArr: string[]) {
    let entity_decorations: vscode.DecorationOptions[] = [];
    let annotation_type_decorations: vscode.DecorationOptions[] = [];
    let annotation_data_type_decorations: vscode.DecorationOptions[] = [];
    let error_decorations: vscode.DecorationOptions[] = [];

    const d0 = new Date();
    const php_parsed = php_parser.parseCode(sourceCode);
    console.log("Parse AST time: " + ((new Date()).getTime() - d0.getTime()).toString());
    //console.log(php_parsed, php_parsed.comments[2]);
    //return;

    temp_decorations = [];
    temp_interesting_code_parts = [];

    const d = new Date();
    try {
        crawlCodePart(php_parsed);
    } catch (e) {
        console.error('get code data errors:', e);
        return;
    }
    console.log("Parse code time " + ((new Date()).getTime() - d.getTime()).toString());
    console.log("php_parsed", php_parsed);

    code_decorations = temp_decorations;
    interesting_code_parts = temp_interesting_code_parts;

    //console.log(code_decorations);

    for (const code_decoration of code_decorations) {
        const loc = code_decoration.loc;

        let range = new vscode.Range(
            new vscode.Position(loc.start.line - 1, loc.start.column),
            new vscode.Position(loc.end.line - 1, loc.end.column),
        );

        let description = "";

        if (code_decoration.data_type) {
            const data_type = code_decoration.data_type;
            const data_type_data = code_decoration.data_type_data;

            if (data_type) {
                description += `**Wo997 Type:**\n\n${data_type}\n\n`;
            }
            if (data_type_data) {
                description += JSON.stringify(data_type_data) + "\n\n";
            }

            const myContent = new vscode.MarkdownString(description);
            myContent.isTrusted = true;

            let decoration: vscode.DecorationOptions = { range, hoverMessage: myContent };

            entity_decorations.push(decoration);
        }
        else if (code_decoration.annotation) {
            const annotation = code_decoration.annotation;

            //if (annotation == "type") {
            description += `**Wo997 Annotation:**\n\n${annotation}\n\n`;
            //}

            const myContent = new vscode.MarkdownString(description);
            myContent.isTrusted = true;

            let decoration: vscode.DecorationOptions = { range, hoverMessage: myContent };

            annotation_type_decorations.push(decoration);
        }
        else if (code_decoration.annotation_data_type) {
            const annotation_data_type = code_decoration.annotation_data_type;

            //if (data_type == "type") {
            description += `**Wo997 Annotation data type:**\n\n${annotation_data_type}\n\n`;
            //}

            const myContent = new vscode.MarkdownString(description);
            myContent.isTrusted = true;

            let decoration: vscode.DecorationOptions = { range, hoverMessage: myContent };

            annotation_data_type_decorations.push(decoration);
        }
        else if (code_decoration.error) {
            const error = code_decoration.error;

            //if (data_type == "type") {
            description += `**Wo997 Error:**\n\n${error}\n\n`;
            //}

            const myContent = new vscode.MarkdownString(description);
            myContent.isTrusted = true;

            let decoration: vscode.DecorationOptions = { range, hoverMessage: myContent };

            error_decorations.push(decoration);
        }


        /*if (code_part_data.entity) {
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
        }*/
    }

    editor.setDecorations(ext.decorate_entity, entity_decorations);
    editor.setDecorations(ext.decorate_annotation_type, annotation_type_decorations);
    editor.setDecorations(ext.decorate_annotation_data_type, annotation_data_type_decorations);
    editor.setDecorations(ext.decorate_error, error_decorations);

    let wo997_annotation_decorations: vscode.DecorationOptions[] = [];

    for (let line_id = 0; line_id < sourceCodeArr.length; line_id++) {
        const line = sourceCodeArr[line_id];

        if (line_id === 0) {
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

                wo997_annotation_decorations.push(decoration);
            }
        }
    }

    editor.setDecorations(ext.decorate_wo997_annotation, wo997_annotation_decorations);
}
