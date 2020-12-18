import * as vscode from "vscode";
import { Program, Block } from 'php-parser';
import { cloneObject, deepMerge } from './util';
import { visibleRanges, textChangeEventTimeout, extractEntityName, getEntityInCodeObj, decorate_entity, entity_data_files, entity_definitions, filePathClean, workspace_path, decorate_annotation } from './extension';

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

interface codeDataFull {
    code_data: Array<any>,
    code_part?: any,
    buffer: any
}

const window = vscode.window;

let code_data_in_current_editor: any = {};

export function getCompletionItemsPHP(document: vscode.TextDocument, position: vscode.Position, linePrefix: string): vscode.CompletionItem[] | undefined {
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

    return undefined;
}

export function scanFilePHP(editor: vscode.TextEditor, sourceCode: string, sourceCodeArr: string[]) {
    let entity_decorations: vscode.DecorationOptions[] = [];

    const d0 = new Date();

    const php_parsed = php_parser.parseCode(sourceCode);

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

        console.log(d);
        const code_data_full = parseCodePart({
            code_part: php_parsed,
            code_data: [],
            buffer: {}
        });
        return;

        const code_data = code_data_full.code_data;

        console.log("Parse visible code time " + ((new Date()).getTime() - d.getTime()).toString());

        code_data_in_current_editor = code_data;

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

    editor.setDecorations(decorate_entity, entity_decorations);

    let annotation_decorations: vscode.DecorationOptions[] = [];

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

                annotation_decorations.push(decoration);
            }
        }
    }

    editor.setDecorations(decorate_annotation, annotation_decorations);
}

export function parseCodePart(code_data_full: codeDataFull): codeDataFull {
    //console.log("cp+kind", code_part, code_part.kind);

    code_data_full.buffer = cloneObject(code_data_full.buffer);

    if (!visibleRanges) {
        return code_data_full;
    }
    const visibleRange = visibleRanges[0];

    if (visibleRange.start === null || visibleRange.end === null) {
        //console.log("fuck no");

        return code_data_full;
    }

    //console.log(JSON.stringify(visibleRange), Object.keys(visibleRange));
    const cx0 = code_data_full.code_part.loc.start.column;
    const cy0 = code_data_full.code_part.loc.start.line - 1;
    const cx1 = code_data_full.code_part.loc.end.column;
    const cy1 = code_data_full.code_part.loc.end.line - 1;
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

    console.log(code_data_full.code_part.kind + ": ", code_data_full.code_part, code_data_full.buffer);

    // say how far the parent expression is
    if (code_data_full.buffer.function) {
        code_data_full.buffer.function.levels++;
    }
    if (code_data_full.buffer.array) {
        code_data_full.buffer.array.levels++;
    }
    if (code_data_full.buffer.entity) {
        code_data_full.buffer.entity.levels++;
    }
    if (code_data_full.buffer.assign) {
        code_data_full.buffer.assign.levels++;
    }
    if (code_data_full.buffer.key) {
        code_data_full.buffer.key.levels++;
    }

    const clearBufferFromVars = () => {
        code_data_full.buffer.variables = [];
    }

    switch (code_data_full.code_part.kind) {
        case "program":
            clearBufferFromVars();
            code_data_full = parseProgram(code_data_full);
            break;
        case "function":
            clearBufferFromVars();
            code_data_full = parseFunction(code_data_full);
            break;
        case "expressionstatement":
            code_data_full = parseExpressionStatement(code_data_full);
            break;
        case "echo":
            code_data_full = parseExpressions(code_data_full);
            break;
        case "offsetlookup":
            code_data_full = parseOffestLookup(code_data_full);
            break;
        case "variable":
            code_data_full = parseVariable(code_data_full);
            break;
        case "array":
            code_data_full = parseArray(code_data_full);
            break;
        case "entry":
            code_data_full = parseEntry(code_data_full);
            break;
        case "call":
            code_data_full = parseCall(code_data_full);
            break;
        case "assign":
            code_data_full = parseAssign(code_data_full);
            break;
        case "if":
            code_data_full = parseIf(code_data_full);
            break;
        case "block":
            code_data_full = parseBlock(code_data_full);
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
            break;
    }


    //console.log("some_code_part_Red", code_data_full);


    return code_data_full;
}

function parseProgram(code_data_full: codeDataFull): codeDataFull {
    for (const sub_code_part of code_data_full.code_part.children) {
        const sub_code_data_full = parseCodePart({ ...code_data_full, code_part: sub_code_part });
        code_data_full.code_data.push(...sub_code_data_full.code_data);
        deepMerge(code_data_full.buffer, sub_code_data_full.buffer);
    }

    return code_data_full;
}

function parseFunction(code_data_full: codeDataFull): codeDataFull {
    for (const sub_code_part of code_data_full.code_part.body.children) {
        const sub_code_data_full = parseCodePart({ ...code_data_full, code_part: sub_code_part });
        code_data_full.code_data.push(...sub_code_data_full.code_data);
        deepMerge(code_data_full.buffer, sub_code_data_full.buffer);
    }
    return code_data_full;
}

function parseMethod(code_data_full: codeDataFull): codeDataFull {
    for (const sub_code_part of code_data_full.code_part.body.children) {
        const sub_code_data_full = parseCodePart({ ...code_data_full, code_part: sub_code_part });
        code_data_full.code_data.push(...sub_code_data_full.code_data);
        deepMerge(code_data_full.buffer, sub_code_data_full.buffer);
    }
    return code_data_full;
}

function parseBlock(code_data_full: codeDataFull): codeDataFull {
    for (const sub_code_part of code_data_full.code_part.children) {
        const sub_code_data_full = parseCodePart({ ...code_data_full, code_part: sub_code_part });
        code_data_full.code_data.push(...sub_code_data_full.code_data);
        deepMerge(code_data_full.buffer, sub_code_data_full.buffer);
    }
    return code_data_full;
}

function parseClass(code_data_full: codeDataFull): codeDataFull {
    for (const sub_code_part of code_data_full.code_part.body) {
        const sub_code_data_full = parseCodePart({ ...code_data_full, code_part: sub_code_part });
        code_data_full.code_data.push(...sub_code_data_full.code_data);
        deepMerge(code_data_full.buffer, sub_code_data_full.buffer);
    }
    return code_data_full;
}

function parseIf(code_data_full: codeDataFull): codeDataFull {
    const test_code_data_full = parseCodePart({ ...code_data_full, code_part: code_data_full.code_part.test });
    code_data_full.code_data.push(...test_code_data_full.code_data);
    deepMerge(code_data_full.buffer, test_code_data_full.buffer);

    const body_code_data_full = parseCodePart({ ...code_data_full, code_part: code_data_full.code_part.body });
    code_data_full.code_data.push(...body_code_data_full.code_data);
    deepMerge(code_data_full.buffer, body_code_data_full.buffer);

    return code_data_full;
}


function parseArray(code_data_full: codeDataFull): codeDataFull {
    //let entity_name = null;
    //console.log("hey", buffer.function, buffer.function.levels == 1, buffer.argument);
    if (code_data_full.buffer.function && code_data_full.buffer.function.levels === 1 && code_data_full.buffer.argument) {
        //console.log("it's ", code_part);
        // TODO: you have to extract that data from somewhere else for sure, that should be ezy man
        if (code_data_full.buffer.function.name == "paginateData" && code_data_full.buffer.argument.index === 0) {
            //entity_name = "pagination_params"
            code_data_full.buffer.entity = {
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
    for (const sub_code_part of code_data_full.code_part.items) {
        array_index++;
        code_data_full.buffer.array = {
            index: array_index,
            levels: 0,
        };
        //console.log("arr", sub_code_part);
        const sub_code_data_full = parseCodePart({ ...code_data_full, code_part: sub_code_part });
        code_data_full.code_data.push(...sub_code_data_full.code_data);
        deepMerge(code_data_full.buffer, sub_code_data_full.buffer);
    }

    return code_data_full;
}

function parseEntry(code_data_full: codeDataFull): codeDataFull {
    //console.log("ENTRY BUFFER", { buffer });

    //const key = code_part.key;
    // we let it be a value so the user can see it highlighted ;)
    const pseudo_key = code_data_full.code_part.key ? code_data_full.code_part.key : code_data_full.code_part.value;

    if (pseudo_key && pseudo_key.kind === "string") {
        const entry_text = pseudo_key ? pseudo_key.value : null;
        const loc = pseudo_key ? pseudo_key.loc : code_data_full.code_part.loc;

        let from_entity = null;

        if (code_data_full.buffer.assign && code_data_full.buffer.assign.levels === 2) {
            const entity_name = extractEntityName(code_data_full.buffer.assign.left.name);
            if (code_data_full.buffer.assign.left.kind == "variable" && entity_name) {
                from_entity = {
                    name: entity_name
                }
            }
        }
        if (code_data_full.buffer.key && code_data_full.buffer.key.levels === 2) {
            const entity_name = extractEntityName(code_data_full.buffer.key.text);
            if (entity_name) {
                from_entity = {
                    name: entity_name
                }
            }
        }
        else if (code_data_full.buffer.entity && code_data_full.buffer.entity.levels === 1) {
            from_entity = code_data_full.buffer.entity;
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

    if (code_data_full.code_part.key && code_data_full.code_part.key.kind === "string" && code_data_full.code_part.value) {
        code_data_full.buffer.key = {
            text: code_data_full.code_part.key.value,
            levels: 0,
        };

        if (code_data_full.code_part.value) {
            console.log("vvvvvvvvvvvvvvvvvvvvv", code_data_full.code_part.value);
            const sub_code_data_full = parseCodePart({ ...code_data_full, code_part: code_data_full.code_part.value });
            code_data_full.code_data.push(...sub_code_data_full.code_data);
            deepMerge(code_data_full.buffer, sub_code_data_full.buffer);
        }
    }

    return code_data_full;
}

/* actual function execution ;) */
function parseCall(code_data_full: codeDataFull): codeDataFull {
    code_data_full.buffer.function = {
        name: code_data_full.code_part.what.name,
        levels: 0,
    };

    //console.log("buffer", code_data_full.buffer, code_part.what.name);

    //console.log("parseCall", code_part);
    let arg_index = 0;
    for (const sub_code_part of code_data_full.code_part.arguments) {
        code_data_full.buffer.argument = {
            index: arg_index,
            levels: 0
        }
        arg_index++;
        const sub_code_data_full = parseCodePart({ ...code_data_full, code_part: sub_code_part });
        code_data_full.code_data.push(...sub_code_data_full.code_data);
        deepMerge(code_data_full.buffer, sub_code_data_full.buffer);
    }

    return code_data_full;
}

function parseAssign(code_data_full: codeDataFull): codeDataFull {
    if (!code_data_full.code_part.left) {
        return code_data_full;
    }

    const sub_code_data_full_left = parseCodePart({ ...code_data_full, code_part: code_data_full.code_part.left });
    code_data_full.code_data.push(...sub_code_data_full_left.code_data);
    deepMerge(code_data_full.buffer, sub_code_data_full_left.buffer);

    code_data_full.buffer.assign = {
        left: code_data_full.code_part.left,
        levels: 0
    }

    if (code_data_full.code_part.left.kind == "variable") {
        if (!Array.isArray(code_data_full.buffer.variables)) {
            code_data_full.buffer.variables = [];
        }
        console.log(code_data_full.buffer.variables);
        const variable = code_data_full.buffer.variables.find((v: any) => {
            return v.name = code_data_full.code_part.left.name;
        })
        if (variable) {
            variable.type = "abc";
        } else {
            code_data_full.buffer.variables.push({
                name: code_data_full.code_part.left.name,
                type: "abc"
            });
        }
    }

    if (code_data_full.code_part.right) {
        const sub_code_data_full_right = parseCodePart({ ...code_data_full, code_part: code_data_full.code_part.right });
        code_data_full.code_data.push(...sub_code_data_full_right.code_data);
        deepMerge(code_data_full.buffer, sub_code_data_full_right.buffer);
    }

    return code_data_full;
}

function parseExpressionStatement(code_data_full: codeDataFull): codeDataFull {
    return parseCodePart(
        { ...code_data_full, code_part: code_data_full.code_part.expression }
    );
}

function parseExpressions(code_data_full: codeDataFull): codeDataFull {
    //console.log("echo", code_part.expressions);
    for (const sub_code_part of code_data_full.code_part.expressions) {
        const sub_code_data_full = parseCodePart({ ...code_data_full, code_part: sub_code_part });
        code_data_full.code_data.push(...sub_code_data_full.code_data);
        deepMerge(code_data_full.buffer, sub_code_data_full.buffer);
    }

    return code_data_full;
}

function parseVariable(code_data_full: codeDataFull): codeDataFull {
    if (code_data_full.code_part.name) {
        const entity_name = extractEntityName(code_data_full.code_part.name);
        if (entity_name) {
            code_data_full.code_data.push(getEntityInCodeObj(code_data_full.code_part.loc, entity_name));
        }
    }

    return code_data_full;
}

function parseOffestLookup(code_data_full: codeDataFull): codeDataFull {
    //console.log("buffer", buffer);

    let name_objs = [];
    let previous_key_obj = code_data_full.code_part;
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

