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

export function deepClone<T extends object>(value: T): T {
    if (typeof value !== 'object' || value === null) {
        return value;
    }

    if (value instanceof Set) {
        return new Set(Array.from(value, deepClone)) as T;
    }

    if (value instanceof Map) {
        return new Map(Array.from(value, ([k, v]) => [k, deepClone(v)])) as T;
    }

    if (value instanceof Date) {
        return new Date(value) as T;
    }

    if (value instanceof RegExp) {
        return new RegExp(value.source, value.flags) as T;
    }

    return Object.keys(value).reduce((acc, key) => {
        return Object.assign(acc, { [key]: deepClone(value[key]) });
    }, (Array.isArray(value) ? [] : {}) as T);
}

export function probablyJSON(str: string) {
    return !!str.match(/^(\{|\[).*(\}|\])$/);
}