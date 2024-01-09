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

import fs from "fs";
import path from "path";
import { isFileOlderThanNMS } from "@/utils/file";

import { GTFSEventEmitter, GTFSEventHandler, GTFSEventType } from "@/services/gtfs/events";

const DB_PATH = "./db/gtfs-db.sqlite";

const REALTIME_UPDATE_INTERVAL = 30000; // 30 seconds

const STALE_TIME = 3600 * 1000; // 1hr

let rtUpdateInterval: ReturnType<typeof setInterval>;

let initialized = false;
let initializing = false;

const config = {
    sqlitePath: DB_PATH,
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

const eventEmitter = new GTFSEventEmitter();

const isDBStale = (dbPath: string) => {
    return !fs.existsSync(dbPath) || isFileOlderThanNMS(dbPath, STALE_TIME);
};

export const init = async () => {
    const dirPath = path.resolve(path.dirname(DB_PATH));
    if (!fs.existsSync(dirPath)) {
        console.log(`[gtfs svc] Directory "${dirPath}" did not exist. Creating directory.`);
        fs.mkdirSync(dirPath, { recursive: true });
    }

    // Only run import on first run or stale. Then data is stored in SQLite.
    if (!initialized && !initializing && isDBStale(DB_PATH)) {
        initializing = true;
        try {
            await importGtfs(config);
            initialized = true;
        } catch (error) {
            console.error(error);
            initializing = false;
        }
    } else {
        console.log(`[gtfs svc] Using existing data from DB at ${DB_PATH}`);
    }

    // Updates realtime data at interval
    clearInterval(rtUpdateInterval);
    rtUpdateInterval = setInterval(async () => {
        try {
            console.log("[GTFS] Updating realtime data.");
            await updateGtfsRealtime(config);
            eventEmitter.emit("rtupdate");
        } catch (error) {
            console.error(error);
        }
    }, REALTIME_UPDATE_INTERVAL);
};

export const on = (event: GTFSEventType, handler: GTFSEventHandler) => {
    // No idea why this needs to be wrapped but it works.
    eventEmitter.on(event, handler);
};

export const once = (event: GTFSEventType, handler: GTFSEventHandler) => {
    // No idea why this needs to be wrapped but it works.
    eventEmitter.once(event, handler);
};

export const off = (event: GTFSEventType, handler: GTFSEventHandler) => {
    // No idea why this needs to be wrapped but it works.
    eventEmitter.off(event, handler);
};

export const db = openDb(config);

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
