import {
    createTRPCClient,
    httpBatchLink,
    httpSubscriptionLink,
    loggerLink,
    splitLink,
} from "@trpc/client";
import { EventSource } from "eventsource";
import superjson from "superjson";
import type { AppRouter } from "../server/src/index";

const trpc = createTRPCClient<AppRouter>({
    links: [
        loggerLink(),
        splitLink({
            // uses the httpSubscriptionLink for subscriptions
            condition: (op) => op.type === "subscription",
            true: httpSubscriptionLink({
                url: "http://localhost:8000",
                EventSource: EventSource,
                transformer: superjson,
            }),
            false: httpBatchLink({
                url: "http://localhost:8000",
                transformer: superjson,
            }),
        }),
    ],
});

const startTime = performance.now();
const result = await trpc.tripInstance.getNearby.query({
    // borden st
    // lat: 48.470398,
    // lng: -123.360676,

    // downtown
    lat: 48.42716854672481,
    lng: -123.3646681006514,

    radiusMeters: 1000,
});

console.log(JSON.stringify(result, null, 2));
console.log("Took", performance.now() - startTime);

// const result = await trpc.tripInstance.getByRouteStopTime.query({
//     routeId: 25,
//     stopId: 807,
//     maxDatetime: new Date(Date.now() + 86400 * 1000),
//     minDatetime: new Date(),
// });

// console.log(JSON.stringify(result, null, 2));
// console.log(result.length);

// await new Promise((r) => {
//     trpc.shape.testSubscription.subscribe("", {
//         onData(data) {
//             console.log(data);
//             r(null);
//         },
//     });
// });

// await new Promise((r) => {
//     trpc.tripInstance.liveTripPositions.subscribe(
//         {
//             agencyId: "BCT-48",
//             routeId: "26-VIC",
//         },
//         {
//             onData(data) {
//                 console.log(data);
//             },
//         }
//     );

//     // trpc.trip.liveTripStopTime.subscribe(
//     //     [
//     //         {
//     //             tripInstanceId: "68e9b8c4fd2bce85d6d3f6b1",
//     //             stopId: "100019",
//     //         },
//     //     ],
//     //     {
//     //         onData(data) {
//     //             console.log(data);
//     //         },
//     //     }
//     // );
// });

// const result = await trpc.tripInstance.getNearby.query({
//     lat: 48.474515,
//     lng: -123.354458,
//     radius: 1000,
// });

// // console.log(JSON.stringify(getObjectTypes(result), null, 2));
// console.log(JSON.stringify(result, null, 2));

// function getObjectTypes(obj: any, typeObject: any = {}) {
//     for (const key in obj) {
//         if (Array.isArray(obj[key])) {
//             if (obj[key].length > 0) {
//                 const item = obj[key][0];
//                 if (typeof item === "object" && item !== null) {
//                     const newTypeObject = getObjectTypes(item, {});
//                     typeObject[key] = [newTypeObject];
//                 } else {
//                     typeObject[key] = [typeof item];
//                 }
//             } else {
//                 typeObject[key] = [];
//             }
//         } else if (typeof obj[key] === "object" && obj[key] !== null) {
//             const newTypeObject = getObjectTypes(obj[key], {});
//             typeObject[key] = newTypeObject;
//         } else {
//             typeObject[key] = typeof obj[key];
//         }
//     }
//     return typeObject;
// }
