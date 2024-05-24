// import fs from "fs";
// import path from "path";
// import GtfsRealtimeBindings from "gtfs-realtime-bindings";
// import { importGtfs } from "./importer";
// import fetch from "node-fetch";

// const config = {
//     agencies: [
//         {
//             url: "https://bct.tmix.se/Tmix.Cap.TdExport.WebApi/gtfs/?operatorIds=48",
//             realtimeUrls: [
//                 // "https://bct.tmix.se/gtfs-realtime/alerts.pb?operatorIds=48",
//                 "https://bct.tmix.se/gtfs-realtime/tripupdates.pb?operatorIds=48",
//                 "https://bct.tmix.se/gtfs-realtime/vehicleupdates.pb?operatorIds=48",
//             ],
//         },
//     ],
// };

// const BIN_BUFFER_PATH = "/tmp/tripupdates.pb";
// const PROTO_FILE = "/tmp/gtfs-realtime.proto";
// const protoPath = path.join(import.meta.dirname, PROTO_FILE);

// importGtfs({
//     url: "https://bct.tmix.se/Tmix.Cap.TdExport.WebApi/gtfs/?operatorIds=48",
//     insertFunc: (type, data) => {
//         console.log(type)
//         console.log(data)
//     },
// });

// // async function fetchDataToFile(url: string, filePath: string) {
// //     try {
// //         const response = await fetch(url);

// //         if (!response.ok) {
// //             throw new Error(`Failed to fetch data. Status Code: ${response.status}`);
// //         }
// //         const writeStream = fs.createWriteStream(filePath);
// //         const data = await response.body // You can use response.json() if you expect JSON data
// //        data?.pipe(writeStream);

// //         console.log("Data saved to file successfully.");
// //     } catch (error) {
// //         console.error(`Error fetching data: ${error}`);
// //     }
// // }

// // fetchDataToFile(
// //     "https://bct.tmix.se/Tmix.Cap.TdExport.WebApi/gtfs/?operatorIds=48",
// //     path.join(import.meta.dirname, "/tmp/test")
// // );

// // console.log("LOAD FROM", protoPath);
// // protobuf.load(protoPath).then((root) => {
// //     const VehiclePosition = root.lookupType("VehiclePosition");

// //     const buffer = fs.readFileSync(path.join(import.meta.dirname, BIN_BUFFER_PATH));

// //     const message = VehiclePosition.decode(buffer);

// //     const errMsg = VehiclePosition.verify(message);
// //     if (errMsg) {
// //         throw Error(errMsg);
// //     }

// //     console.log(VehiclePosition.toObject(message));
// // });

// // (async () => {
// //     try {
// //         const buffer = fs.readFileSync(path.join(import.meta.dirname, BIN_BUFFER_PATH));
// //         const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
// //             new Uint8Array(buffer)
// //         );
// //         feed.entity.forEach((entity) => {
// //             if (entity.tripUpdate) {
// //                 console.log(entity.tripUpdate);
// //             }

// //             entity.vehicle?.position
// //         });
// //     } catch (error) {
// //         console.log(error);
// //         process.exit(1);
// //     }
// // })();
