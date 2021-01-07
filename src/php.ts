import * as vscode from "vscode";
import * as util from './util';
import * as ext from './extension';
import * as sql from './sql';

const engine = require('php-parser');

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

export interface TypeDef {
    name: string;
    properties: any
}

export interface Function {
    name: string;
    args: Array<FunctionArgument>;
    return_data_type: string
    return_modifiers?: Array<string>
}

interface FunctionArgument {
    name: string;
    data_type: string;
    modifiers: Array<string>;
}

interface Property {
    data_type: string;
    name: string;
    optional?: boolean;
    description?: string;
}

interface Decoration extends vscode.DecorationOptions {
    annotation?: string,
    annotation_data_type?: string,
    typedef_property_name?: string,
    modifier?: string
    typedef_data_type?: string,
    param?: string,
    curly_brace?: boolean,
    data_type?: string
    data_type_data?: any
}

enum ScanTypeEnum {
    "decorate",
    "get_metadata"
}

let scan_type: ScanTypeEnum = ScanTypeEnum.decorate;

let temp_errors: Array<vscode.Diagnostic> = [];
let temp_decorations: Array<Decoration> = [];

let file_typedefs: TypeDef[] = [];
let temp_file_typedefs: TypeDef[] = [];

let file_functions: Function[] = [];
let temp_file_functions: Function[] = [];



// usually holds a single or multiple code parts nearby the cursor
let interesting_code_parts: any;
let temp_interesting_code_parts: any;

function log(...vars: any) {
    if (scan_type == ScanTypeEnum.decorate) {
        console.log(...vars);
    }
}

function locToRange(loc: any) {
    return new vscode.Range(
        new vscode.Position(loc.start.line - 1, loc.start.column),
        new vscode.Position(loc.end.line - 1, loc.end.column),
    );
}
function locNumbersToRange(l1: number, c1: number, l2: number, c2: number) {
    return new vscode.Range(
        new vscode.Position(l1 - 1, c1),
        new vscode.Position(l2 - 1, c2),
    );
}

export function getCompletionItems(document: vscode.TextDocument, position: vscode.Position, linePrefix: string): vscode.CompletionItem[] | undefined {
    for (const code_part of interesting_code_parts) {
        // what's funny, we did the exact same check before that item was even added ;)
        if (code_part.kind === "string" && code_part.possible_properties && code_part.loc.start.line - 1 === position.line && code_part.loc.start.column <= position.character && code_part.loc.end.column >= position.character) {
            let suggestions: any = [];
            // @ts-ignore
            Object.entries(code_part.possible_properties).forEach(([prop_name, prop_data]: [any, Property]) => {
                let display_name = "";
                display_name += prop_name;
                if (prop_data.optional) {
                    display_name += "?";
                }

                const completion_item = new vscode.CompletionItem(display_name, vscode.CompletionItemKind.Property);
                completion_item.insertText = prop_name;

                if (prop_data.data_type) {
                    completion_item.detail = prop_data.data_type;
                }

                let description = "";
                if (prop_data.description) {
                    description += prop_data.description + " ";
                }
                if (description) {
                    completion_item.documentation = description;
                }

                suggestions.push(completion_item);
            });
            return suggestions;
        }
    }

    return undefined;
}

function createScope(code_part: any) {
    const new_scope: any = {
        variables: {}
    };

    if (code_part.scope) {
        if (code_part.scope.class) {
            new_scope.class = code_part.scope.class;
        }
    }

    code_part.scope = new_scope;
};

function assignScope(child_code_part: any, code_part: any) {
    child_code_part.scope = code_part.scope;
    child_code_part.parent_code_part = code_part;
    child_code_part.level = code_part.level + 1;
};



function assignDataType(code_part: any, data_type: string, options: any = {}) {
    if (!code_part || !data_type) {
        return;
    }

    code_part.data_type = data_type;

    if (ArrayDataTypeToSingle(data_type)) {
        code_part.data_type_data = {
            type: "array"
        };
    } else {
        if (util.probablyJSON(data_type)) {
            // TODO: try catch?
            code_part.data_type_data = JSON.parse(data_type);
        } else {
            const data_type_data = ext.php_type_defs[data_type];
            if (data_type_data) {
                code_part.data_type_data = data_type_data;
            }
        }
    }

    const hoverable = options.hoverable;
    code_part.hoverable = hoverable !== undefined ? hoverable : true;
}

function assignModifiers(code_part: any, modifiers: Array<any>) {
    code_part.modifiers = modifiers;
}

function addInterestingCodePart(code_part: any) {
    if (isCursorInCodePart(code_part)) {
        temp_interesting_code_parts.push(code_part);
    }
}

function isCursorInCodePart(code_part: any) {
    const selection = vscode.window.activeTextEditor?.selection;
    return selection
        && code_part
        && code_part.loc
        && code_part.loc.start
        && code_part.loc.end

        && code_part.loc.start.line - 1 === selection.start.line
        && code_part.loc.start.column <= selection.start.character
        && code_part.loc.end.column >= selection.start.character;
}

function crawlCodePartComments(comments: any) {
    for (const comment of comments) {
        if (comment.kind === "commentblock") {
            let current_typedef: TypeDef | null = null;

            const lines = comment.value.split("\n");
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                const actual_left = i === 0 ? comment.loc.start.column : 0;
                const actual_line = comment.loc.start.line + i;

                if (line.match(/@typedef .*{/,)) {
                    const match_annotation_type = line.match(/@[^\s]*/);

                    if (match_annotation_type) {
                        const annotation_type = match_annotation_type[0];

                        const start_column = actual_left + match_annotation_type.index;

                        temp_decorations.push({
                            annotation: annotation_type,
                            range: locNumbersToRange(actual_line, start_column, actual_line, start_column + annotation_type.length)
                        });
                    }

                    const match_typedef = line.match(/(?<=@typedef +)[^\s]*(?=.*{)/);
                    if (match_typedef) {
                        const typedef = match_typedef[0];

                        current_typedef = {
                            name: typedef,
                            properties: {}
                        };

                        const start_column = actual_left + match_typedef.index;

                        temp_decorations.push({
                            annotation_data_type: typedef,
                            range: locNumbersToRange(actual_line, start_column, actual_line, start_column + typedef.length)
                        });
                    }

                    const match_start = line.match(/{/);
                    if (match_start) {
                        const start_column = actual_left + match_start.index;

                        temp_decorations.push({
                            curly_brace: true,
                            range: locNumbersToRange(actual_line, start_column, actual_line, start_column + match_start[0].length)
                        });
                    }
                }

                if (current_typedef) {
                    const match_end = line.match(/}/);
                    if ((match_end || i == lines.length - 1) && current_typedef) {
                        temp_file_typedefs.push(current_typedef);
                        current_typedef = null;
                    }

                    if (match_end) {
                        const start_column = actual_left + match_end.index;

                        temp_decorations.push({
                            curly_brace: true,
                            range: locNumbersToRange(actual_line, start_column, actual_line, start_column + match_end[0].length)
                        });
                    } else {
                        const match_property = line.match(/[^\s]*\??: ?[^\s]*/);
                        if (match_property) {
                            const [prop_name_full, data_type_full] = match_property[0].split(":");

                            const start_column = actual_left + match_property.index;

                            const prop_name_optional = prop_name_full.trim();
                            const prop_name = prop_name_optional.replace(/\?/g, "");
                            const data_type = data_type_full.trim();

                            temp_decorations.push({
                                typedef_property_name: prop_name,
                                range: locNumbersToRange(actual_line, start_column, actual_line, start_column + prop_name_optional.length)
                            });

                            const start_column_data_type = start_column + prop_name_optional.length + 1 + data_type_full.indexOf(data_type);
                            const end_column_data_type = start_column_data_type + data_type.length;

                            temp_decorations.push({
                                typedef_data_type: data_type,
                                range: locNumbersToRange(actual_line, start_column_data_type, actual_line, end_column_data_type)
                            });

                            const description = line.substring(end_column_data_type - actual_left).trim();

                            if (current_typedef) {
                                const data_type_obj: any = {
                                    data_type
                                };
                                if (description) {
                                    data_type_obj.description = description;
                                }
                                if (prop_name_optional.endsWith("?")) {
                                    data_type_obj.optional = true;
                                }
                                current_typedef.properties[prop_name] = data_type_obj;
                            }
                        }
                    }
                }
            }
        }
    }
}

function variableAlike(code_part: any) {
    const comments = code_part.leadingComments;

    let annotation_data_type = null;

    if (comments && comments.length > 0) {
        const comment = comments[comments.length - 1];

        if (comment.kind === "commentblock") {
            if (comment.value.match(/@type .*{.*}/)) {
                const match_annotation_type = comment.value.match(/@[^\s]*/);
                if (match_annotation_type) {
                    const annotation_type = match_annotation_type[0];

                    const start_column = comment.loc.start.column + match_annotation_type.index;

                    temp_decorations.push({
                        annotation: annotation_type,
                        range: locNumbersToRange(comment.loc.start.line, start_column, comment.loc.start.line, start_column + start_column + annotation_type.length)
                    });
                }

                const match_annotation_data_type = comment.value.match(/{.*}/);
                if (match_annotation_data_type) {
                    const data_type = match_annotation_data_type[0];
                    annotation_data_type = data_type.substring(1, data_type.length - 1);

                    const start_column = comment.loc.start.column + match_annotation_data_type.index;

                    temp_decorations.push({
                        annotation_data_type: annotation_data_type,
                        range: locNumbersToRange(comment.loc.start.line, start_column, comment.loc.start.line, start_column + start_column + data_type.length)
                    });
                }
            }
        }
    }

    if (annotation_data_type) {
        // sometimes a var, sometimes an offset lookup
        let ref = code_part;
        while (ref.kind == "offsetlookup" && ref.offset) {
            ref = ref.offset;
        }
        if (ref) {
            assignDataType(ref, annotation_data_type);
        }
    }
}

function beforeFunction(code_part: any) {
    const comments = code_part.leadingComments;

    if (!code_part.name || typeof code_part.name.name !== "string") {
        return;
    }

    let return_data_type = "";
    let return_modifiers = [];

    if (comments && comments.length > 0) {
        const comment = comments[comments.length - 1];

        if (comment.kind === "commentblock") {
            const lines = comment.value.split("\n");
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                const actual_left = i === 0 ? comment.loc.start.column : 0;
                const actual_line = comment.loc.start.line + i;

                const match_param_line = line.match(/@param +[^\s]* +\$.+/);
                if (match_param_line) {
                    const [param_ann, data_type, var_name] = match_param_line[0].replace(/ +/, " ").split(" ");

                    const match_param = line.match(/\$[^\s]+/);

                    if (match_param) {
                        const param = match_param[0];

                        if (scan_type == ScanTypeEnum.decorate) {
                            const start_column = actual_left + match_param.index;

                            temp_decorations.push({
                                param: param,
                                range: locNumbersToRange(actual_line, start_column, actual_line, start_column + param.length)
                            });
                        }
                    }

                    let modifiers: Array<any> = [];
                    const match_modifiers = [...line.matchAll(/\!.+/g)];

                    if (match_modifiers) {
                        for (const match_modifier of match_modifiers) {
                            const modifier = match_modifier[0];
                            modifiers.push(modifier.substr(1));

                            if (scan_type == ScanTypeEnum.decorate) {
                                const start_column = actual_left + match_modifier.index;

                                temp_decorations.push({
                                    modifier,
                                    range: locNumbersToRange(actual_line, start_column, actual_line, start_column + modifier.length)
                                });
                            }
                        }
                    }

                    code_part.arguments.forEach((arg: any) => {
                        if (arg.name && "$" + arg.name.name === var_name) {
                            assignDataType(arg, data_type);
                            assignModifiers(arg, modifiers);
                        }
                    })

                }

                const match_return_line = line.match(/@return +[^\s]*.+/);
                if (match_return_line) {
                    const [param_ann, data_type] = match_return_line[0].replace(/ +/, " ").split(" ");

                    let modifiers: Array<any> = [];
                    const match_modifiers = [...line.matchAll(/\!.+/g)];

                    if (match_modifiers) {
                        for (const match_modifier of match_modifiers) {
                            const modifier = match_modifier[0];
                            modifiers.push(modifier.substr(1));

                            if (scan_type == ScanTypeEnum.decorate) {
                                const start_column = actual_left + match_modifier.index;

                                temp_decorations.push({
                                    modifier,
                                    range: locNumbersToRange(actual_line, start_column, actual_line, start_column + modifier.length)
                                });
                            }
                        }
                    }

                    return_data_type = data_type;
                    return_modifiers = modifiers;
                }
            }
        }
    }

    let args: FunctionArgument[] = [];

    code_part.arguments.forEach((arg: any) => {
        const arg_data: FunctionArgument = {
            name: arg.name?.name,
            data_type: arg.data_type,
            modifiers: arg.modifiers
        }
        args.push(arg_data);
    })

    temp_file_functions.push({
        name: getFunctionName(code_part),
        args,
        return_data_type,
        return_modifiers
    });
}

function getFunctionName(code_part: any): string {
    let name = "";
    if (code_part.scope.class) {
        name += code_part.scope.class + "::";
    }
    if (code_part.name && code_part.name.name) {
        name += code_part.name.name;
    }
    return name;
}

function functionAlike(code_part: any) {
    createScope(code_part);

    const args = code_part.arguments;
    const body = code_part.body;

    args.forEach((arg: any) => {
        assignScope(arg, code_part);
        crawlCodePart(arg);
    })

    beforeFunction(code_part);

    args.forEach((arg: any) => {
        assignScope(arg, code_part);
        crawlCodePart(arg);

        if (arg.name && arg.name.name) {
            arg.scope.variables[arg.name.name] = arg.data_type;
        }
    })

    assignScope(body, code_part);
    crawlCodePart(body);
}

function ArrayDataTypeToSingle(data_type: string) {
    if (data_type && data_type.endsWith("[]")) {
        return data_type.substring(0, data_type.length - 2);
    }
    return null;
}

function isLocInVisibleRange(loc: any) {
    if (!loc
        || !loc.start
        || !loc.end
        || !ext.visibleRanges
        || !ext.visibleRanges[0]) {
        return false;
    }
    const visibleRange = ext.visibleRanges[0];

    if (visibleRange.start === null || visibleRange.end === null) {
        return false;
    }

    //const cx0 = code_part.loc.start.column;
    const cy0 = loc.start.line - 1;
    //const cx1 = code_part.loc.end.column;
    const cy1 = loc.end.line - 1;
    //const vx0 = visibleRange.start.character;
    const vy0 = visibleRange.start.line;
    //const vx1 = visibleRange.endcharacter;
    const vy1 = visibleRange.end.line;

    if (cy0 <= vy1 && cy1 >= vy0) {
        return true;
    }
    else {
        return false;
    }
}

function crawlCodePart(code_part: any) {
    if (!code_part.level) {
        code_part.level = 0;
    }

    if (scan_type == ScanTypeEnum.decorate
        && ext.textChangeEventTimeout
        && !isLocInVisibleRange(code_part.loc)) {
        return;
    }

    let comments: any = [];
    const leadingComments = code_part.leadingComments;
    const trailingComments = code_part.trailingComments;
    if (leadingComments) {
        comments.push(...leadingComments);
    }
    if (trailingComments) {
        comments.push(...trailingComments);
    }
    if (comments) {
        crawlCodePartComments(comments);
    }

    switch (code_part.kind) {
        case "program":
            {
                createScope(code_part);

                for (const child of code_part.children) {
                    assignScope(child, code_part);
                    crawlCodePart(child);
                }
            }
            break;
        case "assign":
            {
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

                const function_def: Function = ext.php_functions[code_part.what.name];

                let return_data_type = "";
                let return_modifiers: String[] | undefined = [];

                if (function_def) {
                    return_data_type = function_def.return_data_type;
                    return_modifiers = function_def.return_modifiers;
                }

                let argument_index = -1;
                for (const arg of code_part.arguments) {
                    if (!arg) {
                        continue;
                    }

                    argument_index++;

                    const arg_func_def = function_def ? function_def.args[argument_index] : null;

                    assignScope(arg, code_part);

                    if (arg_func_def) {
                        const data_type = arg_func_def.data_type;
                        assignDataType(arg, data_type);
                    }

                    crawlCodePart(arg);

                    if (arg_func_def && arg_func_def.modifiers && arg_func_def.modifiers.includes("SQL_query")) {
                        const columns = sql.getSqlColumns(arg.value);
                        if (columns) {
                            const properties: any = {};
                            for (const column of columns) {
                                properties[column] = {
                                    description: "Defined in SQL query"
                                };
                            }
                            let sql_data_type = JSON.stringify({
                                properties: properties
                            });

                            if (return_modifiers) {
                                const SQL_selected = return_modifiers.find(e => e.startsWith("SQL_selected"));
                                if (SQL_selected) {
                                    sql_data_type += "[]".repeat((SQL_selected.replace(/[^\[\]]/g, "").length / 2));
                                    return_data_type = sql_data_type;
                                }
                            }
                        }
                    }
                }

                if (return_data_type) {
                    assignDataType(code_part, return_data_type);
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
        case "isset":
            {
                for (const variable of code_part.variables) {
                    assignScope(variable, code_part);
                    crawlCodePart(variable);
                }
            }
            break;
        case "array":
            {
                const data_type = code_part.data_type;
                const data_type_data = code_part.data_type_data;

                for (const item of code_part.items) {
                    assignScope(item, code_part);
                }

                const child_data_type = ArrayDataTypeToSingle(data_type);

                if (child_data_type) {
                    for (const item of code_part.items) {
                        if (item.value) {
                            assignDataType(item.value, child_data_type);
                        }
                    }
                }

                if (data_type_data && data_type_data.properties) {
                    let missing_props: any = util.cloneObject(data_type_data.properties);

                    for (const item of code_part.items) {
                        const fake_key = item.key ? item.key : item.value;
                        if (fake_key.kind == "string") {
                            if (missing_props[fake_key.value]) {
                                delete missing_props[fake_key.value];
                            }
                            else {
                                const in_what = util.probablyJSON(data_type) ? "" : ` in ${data_type}}`;
                                temp_errors.push({
                                    message: `${fake_key.value} not found${in_what}`,
                                    severity: vscode.DiagnosticSeverity.Warning,
                                    range: locToRange(fake_key.loc)
                                });
                            }
                        }
                        if (!item.key) {
                            temp_errors.push({
                                message: `Expected a key-value pair`,
                                severity: vscode.DiagnosticSeverity.Error,
                                range: locToRange(fake_key.loc)
                            });
                        }
                    }

                    for (const item of code_part.items) {
                        const fake_key = item.key ? item.key : item.value;
                        if (fake_key.kind == "string") {
                            fake_key.possible_properties = missing_props;
                            addInterestingCodePart(fake_key);
                        }

                        assignScope(item, code_part);

                        if (item.key && item.key.kind === "string" && item.value) {
                            const sub_data_type_data = data_type_data.properties[item.key.value];
                            if (sub_data_type_data) {
                                assignDataType(item.value, sub_data_type_data.data_type);
                            }
                        }
                    }

                    let missing_names: any = [];

                    // @ts-ignore
                    Object.entries(missing_props).forEach(([prop_name, prop_data]: [any, Property]) => {
                        if (!prop_data.optional) {
                            missing_names.push(` • ${prop_name}\n`);
                        }
                    });

                    if (missing_names.length > 0) {
                        temp_errors.push({
                            message: `Missing keys:\n${missing_names.join("")}`,
                            severity: vscode.DiagnosticSeverity.Error,
                            range: locToRange(code_part.loc)
                        });
                    }
                }

                for (const item of code_part.items) {
                    crawlCodePart(item);
                }
            }
            break;
        case "entry":
            {
                const key = code_part.key;
                const value = code_part.value;

                if (value) {
                    assignScope(value, code_part)
                    crawlCodePart(value);
                }

                if (key) {
                    assignScope(key, code_part)
                    crawlCodePart(key);
                }
            }
            break;
        case "variable":
            {
                variableAlike(code_part);

                let data_type = code_part.data_type;
                if (data_type) {
                    if (code_part.name) {
                        code_part.scope.variables[code_part.name] = data_type;
                    }
                }
                else {
                    data_type = code_part.scope.variables[code_part.name];
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
            }//
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

                if (left) {
                    assignScope(left, code_part);
                }
                if (right) {
                    assignScope(right, code_part);
                }
                if (left) {
                    crawlCodePart(left);
                }
                if (right) {
                    crawlCodePart(right);
                }
            }
            break;
        case "echo":
            {
                const expressions = code_part.expressions;
                for (const expression of expressions) {
                    assignScope(expression, code_part);
                    crawlCodePart(expression);
                }
            }
            break;
        case "foreach":
            {
                const source = code_part.source;
                const value = code_part.value;
                const body = code_part.body;

                assignScope(source, code_part);
                crawlCodePart(source);

                assignScope(value, code_part);
                if (value.kind == "variable") {
                    const child_data_type = ArrayDataTypeToSingle(source.data_type);
                    if (child_data_type) {
                        assignDataType(value, child_data_type);
                    }
                }
                crawlCodePart(value);

                assignScope(body, code_part);
                crawlCodePart(body);
            }
            break;
        case "expressionstatement":
            {
                const left = code_part.expression.left;
                const right = code_part.expression.right;

                if (left && right) {
                    assignScope(left, code_part);
                    assignScope(right, code_part);
                    right.reference = left;

                    variableAlike(right);
                    crawlCodePart(right);

                    left.leadingComments = code_part.leadingComments;
                    variableAlike(left);
                    crawlCodePart(left);

                    if (left.data_type && right.data_type && left.data_type != right.data_type) {
                        temp_errors.push({
                            message: `Cannot assign **${right.data_type}** to **${left.data_type}**!`,
                            severity: vscode.DiagnosticSeverity.Warning,
                            range: locToRange(code_part.expression.loc)
                        });
                    }
                } else {
                    const expression = code_part.expression;
                    if (expression) {
                        assignScope(expression, code_part);

                        expression.leadingComments = code_part.leadingComments;
                        variableAlike(expression);
                        crawlCodePart(expression);
                    }
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

                    if (what.data_type) {
                        if (what.data_type_data && what.data_type_data.properties) {
                            offset.possible_properties = what.data_type_data.properties;

                            addInterestingCodePart(offset);

                            const offset_value = offset.value;
                            const offset_property = offset.possible_properties[offset_value];
                            if (offset_property) {
                                assignDataType(offset, offset_property.data_type);
                            }
                        } else {
                            // we could restrict it to numbers but it's unnecessary
                            // maybe a warning would be just fine
                            const child_data_type = ArrayDataTypeToSingle(what.data_type);
                            if (child_data_type) {
                                assignDataType(offset, child_data_type);
                            }
                        }
                    }

                    if (offset.parent_code_part && offset.parent_code_part.kind == "offsetlookup") {
                        if (offset.data_type) {
                            //assignDataType(offset.parent_code_part, offset.data_type, { hoverable: false });
                            assignDataType(offset.parent_code_part, offset.data_type);
                        }
                    }
                }
            }
            break;
        case "function":
            {
                functionAlike(code_part);
            }
            break;
        /*case "parameter":
            {
                
            }
            break;*/
        case "class":
            {
                createScope(code_part);

                if (code_part.name && code_part.name.name) {
                    code_part.scope.class = code_part.name.name;
                }

                const body = code_part.body;
                for (const body_code_part of body) {
                    assignScope(body_code_part, code_part);
                    crawlCodePart(body_code_part);
                }
            }
            break;
        case "method":
            {
                functionAlike(code_part);
            }
            break;
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
            range: locToRange(code_part.loc)
        });
    }
}

function cleanupTempVars() {
    temp_errors = [];
    temp_decorations = [];
    temp_interesting_code_parts = [];
    temp_file_typedefs = [];
    temp_file_functions = [];
}

export function getFileMetadata(sourceCode: string, file_path: string): ext.FileData | undefined {
    scan_type = ScanTypeEnum.get_metadata;

    cleanupTempVars();

    const php_parsed = php_parser.parseCode(sourceCode);

    try {
        crawlCodePart(php_parsed);
    } catch (e) {
        console.error('get code data errors:', e);
        return undefined;
    }

    file_typedefs = temp_file_typedefs;
    file_functions = temp_file_functions;

    updateFileErrors(file_path, temp_errors);

    return { typedefs: file_typedefs, functions: file_functions };
}

export function decorateFile(sourceCode: string, editor: vscode.TextEditor, file_path: string) {
    scan_type = ScanTypeEnum.decorate;

    cleanupTempVars();

    const d0 = new Date();
    const php_parsed = php_parser.parseCode(sourceCode);
    console.log("Parse AST time: " + ((new Date()).getTime() - d0.getTime()).toString());

    const d = new Date();
    try {
        crawlCodePart(php_parsed);
    } catch (e) {
        console.error('get code data errors:', e);
        return;
    }
    console.log("Parse code time " + ((new Date()).getTime() - d.getTime()).toString());
    console.log("php_parsed", php_parsed);

    const code_decorations = temp_decorations;
    interesting_code_parts = temp_interesting_code_parts;
    file_typedefs = temp_file_typedefs;
    file_functions = temp_file_functions;

    //console.log(file_functions);
    //console.log(file_typedefs);
    //console.log(code_decorations);

    let entity_decorations: vscode.DecorationOptions[] = [];
    let annotation_type_decorations: vscode.DecorationOptions[] = [];
    let annotation_data_type_decorations: vscode.DecorationOptions[] = [];
    //let error_decorations: vscode.DecorationOptions[] = [];
    let typedef_property_name_decorations: vscode.DecorationOptions[] = [];
    let typedef_data_type_decorations: vscode.DecorationOptions[] = [];
    let curly_braces_decorations: vscode.DecorationOptions[] = [];
    let param_decorations: vscode.DecorationOptions[] = [];
    let modifier_decorations: vscode.DecorationOptions[] = [];

    for (const code_decoration of code_decorations) {
        const range = code_decoration.range;

        let description = "";

        if (code_decoration.data_type) {
            const data_type = code_decoration.data_type;
            const data_type_data = code_decoration.data_type_data;

            const display_type = util.probablyJSON(data_type) ? "custom" : data_type;
            if (display_type) {
                description += `${display_type}\n\n`;
            }
            if (data_type_data && data_type_data.properties) {
                // @ts-ignore
                description += Object.entries(data_type_data.properties).map(([prop_name, prop_data]: [any, Property]) => {
                    let display = "";
                    display += ` • ${prop_name}`;
                    if (prop_data.optional) {
                        display += `?`;
                    }
                    if (prop_data.description) {
                        display += ` - ${prop_data.description}`;
                    }
                    return display;
                }).join("\n\n") + "\n\n";
            }

            const myContent = new vscode.MarkdownString(description);
            myContent.isTrusted = true;

            let decoration: vscode.DecorationOptions = { range, hoverMessage: myContent };

            entity_decorations.push(decoration);
        }
        else if (code_decoration.annotation) {
            const annotation = code_decoration.annotation;

            description += `${annotation}\n\n`;

            const myContent = new vscode.MarkdownString(description);
            myContent.isTrusted = true;

            let decoration: vscode.DecorationOptions = { range, hoverMessage: myContent };

            annotation_type_decorations.push(decoration);
        }
        else if (code_decoration.annotation_data_type) {
            const annotation_data_type = code_decoration.annotation_data_type;

            description += `${annotation_data_type}\n\n`;

            const myContent = new vscode.MarkdownString(description);
            myContent.isTrusted = true;

            let decoration: vscode.DecorationOptions = { range, hoverMessage: myContent };

            annotation_data_type_decorations.push(decoration);
        }
        /*else if (code_decoration.error) {
            const error = code_decoration.error;

            description += `**Wo997 Error:**\n\n${error}\n\n`;

            const myContent = new vscode.MarkdownString(description);
            myContent.isTrusted = true;

            let decoration: vscode.DecorationOptions = { range, hoverMessage: myContent };

            error_decorations.push(decoration);
        }*/
        else if (code_decoration.typedef_property_name) {
            const typedef_property_name = code_decoration.typedef_property_name;

            description += `${typedef_property_name}\n\n`;

            const myContent = new vscode.MarkdownString(description);
            myContent.isTrusted = true;

            let decoration: vscode.DecorationOptions = { range, hoverMessage: myContent };

            typedef_property_name_decorations.push(decoration);
        }
        else if (code_decoration.typedef_data_type) {
            const typedef_data_type = code_decoration.typedef_data_type;

            description += `${typedef_data_type}\n\n`;

            const myContent = new vscode.MarkdownString(description);
            myContent.isTrusted = true;

            let decoration: vscode.DecorationOptions = { range, hoverMessage: myContent };

            typedef_data_type_decorations.push(decoration);
        }
        else if (code_decoration.curly_brace) {
            let decoration: vscode.DecorationOptions = { range };
            curly_braces_decorations.push(decoration);
        }
        else if (code_decoration.param) {
            let decoration: vscode.DecorationOptions = { range };
            param_decorations.push(decoration);
        }
        else if (code_decoration.modifier) {
            let decoration: vscode.DecorationOptions = { range };
            modifier_decorations.push(decoration);
        }
    }

    updateFileErrors(file_path, temp_errors);

    //editor.setDecorations(ext.decorate_error, error_decorations);
    editor.setDecorations(ext.decorate_entity, entity_decorations);
    editor.setDecorations(ext.decorate_annotation_type, annotation_type_decorations);
    editor.setDecorations(ext.decorate_annotation_data_type, annotation_data_type_decorations);
    editor.setDecorations(ext.decorate_typedef_property_name, typedef_property_name_decorations);
    editor.setDecorations(ext.decorate_typedef_data_type, typedef_data_type_decorations);
    editor.setDecorations(ext.decorate_curly_braces, curly_braces_decorations);
    editor.setDecorations(ext.decorate_params, param_decorations);
    editor.setDecorations(ext.decorate_modifiers, modifier_decorations);

    let wo997_annotation_decorations: vscode.DecorationOptions[] = [];

    const sourceCodeArr = sourceCode.split('\n');

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

function updateFileErrors(file_path: string, errors: Array<vscode.Diagnostic>) {
    try {
        ext.phpDiagnosticCollection.set(vscode.Uri.parse(file_path), errors);
    } catch (e) {
        //console.error("Can't show diagnostics in: ", file_path);
    }
}
