export function cloneObject(obj: any) {
    var clone: any = {};
    for (var i in obj) {
        if (obj[i] != null && typeof (obj[i]) == "object")
            clone[i] = cloneObject(obj[i]);
        else
            clone[i] = obj[i];
    }
    return clone;
}

export function deepMerge(...sources: any) {
    let acc: any = {};
    for (const source of sources) {
        if (source instanceof Array) {
            if (!(acc instanceof Array)) {
                acc = [];
            }
            acc = [...acc, ...source];
        } else if (source instanceof Object) {
            for (let [key, value] of Object.entries(source)) {
                if (value instanceof Object && key in acc) {
                    value = deepMerge(acc[key], value);
                }
                acc = { ...acc, [key]: value };
            }
        }
    }
    return acc;
}