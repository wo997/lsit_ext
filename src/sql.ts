const opt = {
    database: 'MySQL' // MySQL is the default database
}
// import mysql parser only
const { Parser } = require('node-sql-parser/build/mysql');
const parser = new Parser()
// opt is optional

export function getSqlColumns(sql: string) {
    try {
        const ast = parser.astify(sql, opt);
        if (ast.type == "select") {
            const ret_columns = [];
            for (const column of ast.columns) {
                if (column.as) {
                    ret_columns.push(column.as);
                }
                else if (column.expr && column.expr.column) {
                    ret_columns.push(column.expr.column);
                }
            }

            return ret_columns;
        }
    }
    catch (e) { }

    return undefined;
}