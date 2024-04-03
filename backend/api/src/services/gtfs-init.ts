import { importGtfs, openDb } from "gtfs";
import type BetterSqlite3 from "better-sqlite3";
import path from "path";
import { getTmpDir } from "@/utils/files";

const tmpDbPath = path.join(getTmpDir(), "gtfs-db.sqlite");

const config = {
    sqlitePath: tmpDbPath,
    agencies: [
        {
            url: "https://bct.tmix.se/Tmix.Cap.TdExport.WebApi/gtfs/?operatorIds=48",
            realtimeUrls: [
                "https://bct.tmix.se/gtfs-realtime/alerts.pb?operatorIds=48",
                "https://bct.tmix.se/gtfs-realtime/tripupdates.pb?operatorIds=48",
                "https://bct.tmix.se/gtfs-realtime/vehicleupdates.pb?operatorIds=48",
            ],
        },
    ],
};

export async function initGTFS() {
    try {
        await importGtfs(config);
    } catch (error) {
        console.error(error);
    }

    const primary = openDb(config);
    db.primary = primary;
}

export const db: {
    primary: null | BetterSqlite3.Database;
} = {
    primary: null,
};
