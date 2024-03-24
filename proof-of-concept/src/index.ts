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

const TMP_DATA_PATH = "./tmp_data";

const DB_PATH = `./${TMP_DATA_PATH}/gtfs-db.sqlite`;

const REALTIME_UPDATE_INTERVAL = 30 * 1000; // 30 seconds

const config = {
    sqlitePath: DB_PATH,
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

try {
    await importGtfs(config);
} catch (error) {
    console.error(error);
}

const db = openDb(config);

// Get GeoJSON for all routes
const shapesGeojson = await getShapesAsGeoJSON({}, { db });
fs.writeFileSync(path.join(TMP_DATA_PATH, "routes.geo.json"), JSON.stringify(shapesGeojson));

// Collect RT update info
setInterval(async () => {
    try {
        await updateGtfsRealtime(config);

        const vehiclePositions = getVehiclePositions({}, [], [], { db });

        const fileName = `rtvp_${Date.now()}.json`;
        const filePath = path.join(TMP_DATA_PATH, fileName);

        fs.writeFileSync(filePath, JSON.stringify(vehiclePositions));
        console.log("Wrote", filePath);
    } catch (error) {
        console.log("Failed to collect RT data at", Date.now());
    }
}, REALTIME_UPDATE_INTERVAL);
