import * as csv from "csv";
import zlib from "zlib";
import fs from "fs";
import os from "os";
import path from "path";

interface ImportConfig {
    url: string;
    realtimeUrls: string[];
}

export function importGtfs(config: ImportConfig) {}

/**
 * Extracts a zip file to a temporary directory.
 *
 * @param fileToZip The path to the zip file.
 * @returns The path to the temporary directory.
 */
function extractZipToTmp(fileToZip: string) {
    if (!fs.existsSync(fileToZip)) {
        throw new Error(`File "${fileToZip}" does not exist`);
    }

    const pathToTmpDir = path.join(os.tmpdir(), path.parse(fileToZip).name);

    const fileInputStream = fs.createReadStream(fileToZip);
    const fileOutputStream = fs.createWriteStream(pathToTmpDir);

    const gunzip = zlib.createGunzip();

    // Pipe the streams together. The order matters.
    fileInputStream.pipe(gunzip).pipe(fileOutputStream);

    return new Promise<string>((resolve, reject) => {
        // When the file is fully extracted, resolve with the path to the
        // temporary directory.
        fileOutputStream.on("finish", () => {
            resolve(pathToTmpDir);
        });

        // If an error occurs while extracting, reject with the error
        // and delete the temporary directory to ensure we don't leave
        // behind a partially extracted file.
        fileOutputStream.on("error", (error) => {
            fs.rmSync(pathToTmpDir);
            reject(error);
        });
    });
}

function importStaticGtfs(fileToZip: string) {}
