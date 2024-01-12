export function stripUndefines(obj: any) {
    if (typeof obj !== "object" || !obj) return obj;
    for (const key of Object.keys(obj)) if (obj[key] === undefined) delete obj[key];
    return obj;
}

export function reqQueryToAdvGTFSQuery(obj: any, tableName: string) {
    obj = stripUndefines(obj);
    for (const key of Object.keys(obj)) {
        obj[`${tableName}.${key}`] = obj[key];
        delete obj[key];
    }
    return obj;
}
