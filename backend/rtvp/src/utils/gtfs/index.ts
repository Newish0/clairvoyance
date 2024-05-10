import fs from "fs";
import path from "path";
import protobuf from "protobufjs";

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

const TMP_PATH = "/tmp/tripupdates.pb";
const PROTO_FILE = "/tmp/gtfs-realtime.proto";
const protoPath = path.join(import.meta.dirname, PROTO_FILE);
console.log("LOAD FROM", protoPath);
const root = protobuf.loadSync(protoPath);

const TripUpdate = root.lookupType("TripUpdate")
const StopTimeEvent = root.get("StopTimeEvent");

const message = StopTimeEvent.decode(fs.readFileSync(path.join(import.meta.dirname, TMP_PATH)));
