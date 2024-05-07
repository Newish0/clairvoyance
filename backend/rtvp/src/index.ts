import { getTripUpdates, getVehiclePositions, importGtfs, openDb, updateGtfsRealtime } from "gtfs";
import type BetterSqlite3 from "better-sqlite3";

import { realtime_vehicle_position as rtvpTable } from "./db/schemas/rtvp";
import { tripUpdates as tripUpdatesTable } from "./db/schemas/trip_updates";
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
                "https://bct.tmix.se/gtfs-realtime/tripupdates.pb?operatorIds=48",
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

        const tripUpdates = getTripUpdates({}, [], [], {});
        for (const tu of tripUpdates) {
            const existingTU = await db.query.tripUpdates.findFirst({
                where: (tripUpdates, { and, eq }) =>
                    and(
                        eq(tripUpdates.trip_id, tu.trip_id),
                        eq(tripUpdates.start_date, tu.start_date),
                        eq(tripUpdates.trip_start_time, tu.trip_start_time)
                    ),
            });

            try {
                if (!existingTU && tu.schedule_relationship === "SCHEDULED") {
                    await db.insert(tripUpdatesTable).values(tu);
                }
            } catch (error) {
                console.log("Failed to insert", tu, error);
            }
        }

        const vehiclePositions = getVehiclePositions({}, [], [], {}) as RawRTVP[];

        for (const vp of vehiclePositions) {
            if (await isDuplicate(vp)) {
                console.log("Duplicate", vp);
                continue;
            }

            const relatedTUs = getTripUpdates(
                {
                    trip_id: vp.trip_id,
                },
                [],
                [],
                {}
            );

            if (relatedTUs.length === 0) {
                console.log("SKIP: No related TUs", vp);
                continue;
            }

            if (relatedTUs.length > 1) {
                console.log("SKIP: Multiple related TUs", vp);
                continue;
            }

            const relatedTU = relatedTUs[0];

            let transformedRtvp;
            try {
                transformedRtvp = await transformRtvp(vp, {
                    start_date: relatedTU.start_date,
                    trip_start_time: relatedTU.trip_start_time,
                });
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
