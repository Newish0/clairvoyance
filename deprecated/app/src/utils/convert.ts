type KeyFunction<T> = (obj: T) => string | number;

export function groupBy<T>(objects: T[], keyFunc: KeyFunction<T>): { [key: string]: T[] } {
    const groupedData: { [key: string]: T[] } = {};

    for (const obj of objects) {
        const key = keyFunc(obj).toString();

        if (key in groupedData) {
            groupedData[key].push(obj);
        } else {
            groupedData[key] = [obj];
        }
    }

    return groupedData;
}
