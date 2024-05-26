import fs from "fs";
import os from "os";
import path from "path";
import fetch from "node-fetch";
import unzipper from "unzipper";
import { parse } from "csv";
import { SingleBar } from "cli-progress";

// TODO: Implement GTFS default values on blank fields

// TODO: Add support for other GTFS data files
export enum InsertionType {
    Shapes,
    StopTimes,
    Stops,
    Trips,
    Routes,
    TripUpdates,
    VehiclePositions,
    CalendarDates,
}

const STATIC_GTFS_FILE_NAME_TO_TYPE: Record<string, InsertionType> = {
    "shapes.txt": InsertionType.Shapes,
    "stop_times.txt": InsertionType.StopTimes,
    "stops.txt": InsertionType.Stops,
    "trips.txt": InsertionType.Trips,
    "routes.txt": InsertionType.Routes,
    "trip_updates.txt": InsertionType.TripUpdates,
    "vehicle_positions.txt": InsertionType.VehiclePositions,
    "calendar_dates.txt": InsertionType.CalendarDates,
};

type InsertFunction = (
    type: InsertionType,
    values: Record<string, string>
) => void | Promise<void>;

interface StaticImportConfig {
    url: string;
    insertFunc: InsertFunction;
}

export async function importGtfs(config: StaticImportConfig) {
    try {
        const res = await fetch(config.url);

        if (!res.ok) {
            throw new Error("Failed to fetch GTFS data");
        }

        const zipStream = res.body;

        if (!zipStream) {
            throw new Error("No zip stream found");
        }

        const tmpDirPath = await extractZipStreamToTmp(zipStream);

        const files = fs.readdirSync(tmpDirPath);

        // Ensure files are in order to avoid foreign key violations
        const orderedFiles = [
            "routes.txt",
            "trips.txt",
            "shapes.txt",
            "stops.txt",
            "stop_times.txt",
            "calendar_dates.txt",
        ].filter((fileName) => files.includes(fileName));

        for (const fileName of orderedFiles) {
            const filePath = path.join(tmpDirPath, fileName);
            const type = STATIC_GTFS_FILE_NAME_TO_TYPE[fileName];

            if (type === undefined) {
                continue;
            }

            const totalSize = fs.statSync(filePath).size;
            const progressBar = new SingleBar({
                format: `${fileName} \t| {bar} | {percentage}% ({eta}s)`,
                barCompleteChar: "\u25AE",
                barIncompleteChar: "\u25AF",
            });
            progressBar.start(1, 0);

            const streamA = fs.createReadStream(filePath);
            const streamB = fs.createReadStream(filePath);

            const keys = await new Promise<string[]>((resolve, reject) => {
                streamA
                    .pipe(parse({ delimiter: ",", to_line: 2, from_line: 1 }))
                    .once("data", function (row) {
                        resolve(row.map((data: string) => data.trim()));
                        streamA.destroy();
                    })
                    .once("error", (err) => {
                        reject(err);
                    });
            });

            let processedSize = 0;
            streamB.on("data", (chunk) => {
                processedSize += chunk.length;
                const progress = processedSize / totalSize;
                progressBar.update(progress);
            });

            const insertionPromises: Promise<void>[] = [];
            await new Promise<void>((resolve, reject) => {
                streamB
                    .pipe(parse({ delimiter: ",", from_line: 2 }))
                    .on("data", function (row) {
                        insertionPromises.push(
                            (async () => {
                                await config.insertFunc(
                                    type,
                                    Object.fromEntries(keys.map((key, i) => [key, row[i].trim()]))
                                );
                            })()
                        );
                    })
                    .once("finish", () => {
                        resolve();
                    })
                    .once("error", (err) => {
                        reject(err);
                    });
            }); // CSV read promise
            await Promise.all(insertionPromises);
            progressBar.stop();
        } // for

        fs.rmSync(tmpDirPath, { recursive: true, force: true });
    } catch (error) {
        console.error(error);
    }
}

/**
 * Extracts a zip file to a temporary directory.
 *
 * @param zipStream The stream of the zip file.
 * @returns The path to the temporary directory.
 */
function extractZipStreamToTmp(zipStream: NodeJS.ReadableStream) {
    const randomUUID = crypto.randomUUID();

    const pathToTmpDir = path.join(os.tmpdir(), randomUUID);

    return new Promise<string>((resolve, reject) => {
        zipStream
            .pipe(unzipper.Extract({ path: pathToTmpDir }))
            .on("close", () => {
                resolve(pathToTmpDir);
            })
            .on("error", (err) => {
                reject(err);
            });
    });
}

function importStaticGtfs(pathToZip: string) {}
