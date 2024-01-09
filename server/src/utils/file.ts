import fs from "fs";

/**
 *
 * @param filePath
 * @param n number of milliseconds since modification
 * @returns
 */
export function isFileOlderThanNMS(filePath: string, n: number): boolean {
    const fileStat = fs.statSync(filePath);
    const currentTime = new Date().getTime();
    const timeDifference = currentTime - fileStat.mtime.getTime();
    return timeDifference > n;
}
