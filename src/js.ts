import * as vscode from "vscode";
import { Program, Block } from 'php-parser';
import { cloneObject, deepMerge } from './util';
import { visibleRanges, textChangeEventTimeout, extractEntityName, getEntityInCodeObj, decorate_entity, entity_data_files, entity_definitions, filePathClean, workspace_path, decorate_annotation } from './extension';

const esprima = require('esprima');

export function scanFileJS(editor: vscode.TextEditor, sourceCode: string, sourceCodeArr: string[]) {
    //const result = esprima.parseScript(sourceCode);
    //console.log(result);
}
