export function deepAssign(target: any, src: any) {
    return cloneObject(src, target);
}

export function cloneObject(obj: any, src = null) {
    if (!obj) {
        return obj;
    }

    let v;
    let obj_b: any = src ? src : (Array.isArray(obj) ? [] : {});
    for (const k in obj) {
        v = obj[k];
        obj_b[k] = typeof v === "object" ? cloneObject(v, obj_b[k]) : v;
    }

    return obj_b;
}

export function probablyJSON(str: string) {
    return !!str.match(/^(\{|\[).*(\}|\])$/);
}
export function toCamelCase(str: string) {
    return str ? str.replace(/([a-z])([A-Z])/g, function (allMatches, firstMatch, secondMatch) {
        return firstMatch + " " + secondMatch;
    })
        .toLowerCase()
        .replace(/([ -_]|^)(.)/g, function (allMatches, firstMatch, secondMatch) {
            return secondMatch.toUpperCase();
        }) : "";
}

export function kebabToSnakeCase(string: string) {
    return string.replace(/-([a-z])/gi, function (s, group1) {
        return group1.toUpperCase();
    });
}

export function camelToSnakeCase(str: string) {
    if (!str) {
        return "";
    }
    str = str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
    if (str[0] === "_") {
        str = str.substring(1);
    }
    return str;
};
