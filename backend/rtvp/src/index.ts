import { getVehiclePositions, importGtfs, openDb, updateGtfsRealtime } from "gtfs";
import type BetterSqlite3 from "better-sqlite3";

import { realtime_vehicle_position as rtvpTable } from "./db/schemas/rtvp";
import db from "./db";

import { RawRTVP } from "./types/rtvp";
import { isDuplicate, transformRtvp } from "./utils/rtvp";

const REALTIME_UPDATE_INTERVAL = 15 * 1000; // 15 seconds

// Use memory DB
const config = {
    agencies: [
        {
            url: "https://bct.tmix.se/Tmix.Cap.TdExport.WebApi/gtfs/?operatorIds=48",
            realtimeUrls: [
                // "https://bct.tmix.se/gtfs-realtime/alerts.pb?operatorIds=48",
                // "https://bct.tmix.se/gtfs-realtime/tripupdates.pb?operatorIds=48",
                "https://bct.tmix.se/gtfs-realtime/vehicleupdates.pb?operatorIds=48",
            ],
        },
    ],
};

await importGtfs(config);

// Collect RT update info
setInterval(async () => {
    try {
        await updateGtfsRealtime(config);
        const vehiclePositions = getVehiclePositions({}, [], [], {}) as RawRTVP[];

        for (const vp of vehiclePositions) {
            if (await isDuplicate(vp)) {
                console.log("Duplicate", vp);
                continue;
            }

            let transformedRtvp;
            try {
                transformedRtvp = await transformRtvp(vp);
            } catch (error) {
                console.log("Failed to transform RTVP", vp, error);
                continue;
            }

            console.log("Transformed", vp, transformedRtvp);
            await db.insert(rtvpTable).values(transformedRtvp);
        }

        console.log();
    } catch (error) {
        console.log("Failed to collect RT data at", Date.now());
        console.error(error);
    }
}, REALTIME_UPDATE_INTERVAL);
