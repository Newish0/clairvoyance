import { getTripUpdates, getVehiclePositions, importGtfs, openDb, updateGtfsRealtime } from "gtfs";
import type BetterSqlite3 from "better-sqlite3";

import { realtime_vehicle_position as rtvpTable } from "./db/schemas/rtvp";
import { rtvp_polyregr as rtvpPolyRegrTable } from "./db/schemas/rtvp_polyregr";
import { tripUpdates as tripUpdatesTable } from "./db/schemas/trip_updates";
import db from "./db";

import { RawRTVP } from "./types/rtvp";
import { computePredictionPolynomial, isDuplicate, transformRtvp } from "./utils/rtvp";
import { Result as RegressionResult } from "regression";

const REALTIME_UPDATE_INTERVAL = 15 * 1000; // 15 seconds
const PREDICTION_COEFF_UPDATE_INTERVAL = 60 * 1000; // 60 seconds

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
const performUpdate = async () => {
    try {
        await updateGtfsRealtime(config);

        await updateTripUpdates();

        await updateRtvp();

        console.log();
    } catch (error) {
        console.log("Failed to collect RT data at", Date.now());
        console.error(error);
    }
};

const refreshPredictionCoeffs = async () => {
    const routes = await db.query.routes.findMany();
    for (const route of routes) {
        const updateRtvpPolyRegr = async (results: RegressionResult | null, direction_id: number) => {
            if (!results) {
                return;
            }

            const n = results.equation.length - 1;
            for (let i = 0; i < results.equation.length; i++) {
                const coeff = results.equation[i];
                const pow = n - i;

                const newPolyRegr: typeof rtvpPolyRegrTable.$inferInsert = {
                    route_id: route.route_id,
                    direction_id,
                    ci: coeff,
                    i: pow,
                };

                await db
                    .insert(rtvpPolyRegrTable)
                    .values(newPolyRegr)
                    .onConflictDoUpdate({
                        target: [
                            rtvpPolyRegrTable.route_id,
                            rtvpPolyRegrTable.direction_id,
                            rtvpPolyRegrTable.i,
                        ],
                        set: { ci: newPolyRegr.ci },
                    });
            }
        };

        const d0Result = await computePredictionPolynomial(route.route_id, 0);
        const d1Result = await computePredictionPolynomial(route.route_id, 1);

        await updateRtvpPolyRegr(d0Result, 0);
        await updateRtvpPolyRegr(d1Result, 1);
    }
};

setInterval(performUpdate, REALTIME_UPDATE_INTERVAL);
performUpdate();

setInterval(refreshPredictionCoeffs, PREDICTION_COEFF_UPDATE_INTERVAL);
refreshPredictionCoeffs();

async function updateTripUpdates() {
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
                let tripDate = null;
                if (tu.trip_start_time && tu.start_date) {
                    const tripStartDate = tu.start_date.replace(
                        /(\d{4})(\d{2})(\d{2})/,
                        "$1-$2-$3"
                    ); // 20210619 -> 2021-06-19
                    tripDate = new Date(tripStartDate + " GMT-0700"); // FIXME: hardcoded timezone
                    const [h, m, s] = tu.trip_start_time.split(":");
                    tripDate.setHours(parseInt(h), parseInt(m), parseInt(s), 0);
                    console.log(tripDate);
                }

                await db.insert(tripUpdatesTable).values({ ...tu, trip_start_timestamp: tripDate });
            }
        } catch (error) {
            console.log("Failed to insert", tu, error);
        }
    }
}

async function updateRtvp() {
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
}
