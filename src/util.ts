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
export function toTitleCase(str: string): string {
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

export function isObject(input: any) {
    return input && !Array.isArray(input) && typeof input === "object";
}

export function isArray(input: any) {
    return input && Array.isArray(input) && typeof input === "object";
}
export function isEquivalent(a: any, b: any) {
    if (!a || !b) {
        return a === b;
    }
    const aProps = Object.getOwnPropertyNames(a);
    const bProps = Object.getOwnPropertyNames(b);

    if (aProps.length !== bProps.length) {
        return false;
    }

    for (const prop of aProps) {
        if (typeof a[prop] === "object") {
            if (!isEquivalent(a[prop], b[prop])) {
                return false;
            }
        } else {
            if (a[prop] !== b[prop]) {
                return false;
            }
        }
    }

    return true;
}