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
        obj_b[k] = typeof v === "object" ? cloneObject(v) : v;
    }

    return obj_b;
}

export function probablyJSON(str: string) {
    return !!str.match(/(\{|\[).*(\}|\])/);
}