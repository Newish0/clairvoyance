import {
    importGtfs,
    updateGtfsRealtime,
    getVehiclePositions,
    getTrips,
    getStopsAsGeoJSON,
    getShapesAsGeoJSON,
    openDb,
    getRoutes,
} from "gtfs";

import process from "process";

export type GTFSEventHandler = () => void;

type GTFSEvent = "rtupdate";

const REALTIME_UPDATE_INTERVAL = 60000; // 60 seconds

let initialized = false;
let initializing = false;

const GTFSUpdateHandlers: Record<GTFSEvent, GTFSEventHandler[]> = { rtupdate: [] };

const config = {
    // sqlitePath: ":memory:",
    sqlitePath: "gtfs-db.sqlite",
    agencies: [
        {
            url: "http://victoria.mapstrat.com/current/google_transit.zip",
            realtimeUrls: [
                "http://victoria.mapstrat.com/current/gtfrealtime_VehiclePositions.bin",
                "http://victoria.mapstrat.com/current/gtfrealtime_TripUpdates.bin",
                "http://victoria.mapstrat.com/current/gtfrealtime_ServiceAlerts.bin",
            ],
            prefix: "VIC",
        },
    ],
};

export const db = openDb(config);

export function on(event: GTFSEvent, handler: GTFSEventHandler) {
    GTFSUpdateHandlers[event].push(handler);
}

export function off(event: GTFSEvent, handler: GTFSEventHandler) {
    const index = GTFSUpdateHandlers[event].indexOf(handler);
    GTFSUpdateHandlers[event].splice(index, 1);
}

// FIXME: Problem with memory usage on init with file sqlitePath.
// Only run import on first run. Then data is stored in SQLite.
// if (!initialized && !initializing) {
//     initializing = true;
//     try {
//         await importGtfs(config);
//         initialized = true;
//     } catch (error) {
//         console.error(error);
//         initializing = false;
//     }
// }

// Updates realtime data at interval
setInterval(async () => {
    try {
        console.log("[GTFS] Updating realtime data.");
        await updateGtfsRealtime(config);
        for (const handler of GTFSUpdateHandlers.rtupdate) handler();
    } catch (error) {
        console.error(error);
    }
}, REALTIME_UPDATE_INTERVAL);

// const routes = getRoutes(
//     {}, // No query filters
//     [],
//     // ['route_id', 'route_short_name', 'route_color'], // Only return these fields
//     [["route_short_name", "ASC"]], // Sort by this field and direction
//     { db: db } // Options for the query. Can specify which database to use if more than one are open
// );

// console.log("\n\nroutes\n", routes);

// const vehiclePositions = getVehiclePositions();

// console.log("\n\nvehiclePositions\n", vehiclePositions.slice(0, 5));

// const trips = getTrips();

// console.log("\n\ntrips\n", trips.slice(0, 5));

// const stopsGeojson = await getStopsAsGeoJSON();
// fs.writeFile("stops.geo.json", JSON.stringify(stopsGeojson, null, 2));

// const shapesGeojson  = await getShapesAsGeoJSON();
// fs.writeFile("shapes.geo.json", JSON.stringify(shapesGeojson, null, 2));
