import os from "os";

import fs from "fs";
import path from "path";

import pkgJson from "@/../package.json";

export function getTmpDir() {
    const tmpDirPath = path.join(os.tmpdir(), pkgJson.name);
    if (!fs.existsSync(tmpDirPath)) fs.mkdirSync(tmpDirPath, { recursive: true });
    return tmpDirPath;
}

export function clearTmpDir() {
    const tmpDirPath = getTmpDir();
    if (fs.existsSync(tmpDirPath)) {
        fs.readdirSync(tmpDirPath).forEach((file) => {
            const filePath = path.join(tmpDirPath, file);
            if (fs.statSync(filePath).isDirectory()) {
                clearDir(filePath);
            } else {
                fs.unlinkSync(filePath);
            }
        });
        fs.rmdirSync(tmpDirPath);
    }
}

export function clearDir(dirPath: string) {
    if (fs.existsSync(dirPath)) {
        fs.readdirSync(dirPath).forEach((file) => {
            const filePath = path.join(dirPath, file);
            if (fs.statSync(filePath).isDirectory()) {
                clearDir(filePath);
            } else {
                fs.unlinkSync(filePath);
            }
        });
        fs.rmdirSync(dirPath);
    }
}
