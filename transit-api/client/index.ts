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
                url: "http://localhost:3000",
                EventSource: EventSource,
                transformer: superjson,
            }),
            false: httpBatchLink({
                url: "http://localhost:3000",
                transformer: superjson,
            }),
        }),
    ],
});

// await new Promise((r) => {
//     trpc.shape.testSubscription.subscribe("", {
//         onData(data) {
//             console.log(data);
//             r(null);
//         },
//     });
// });

await new Promise((r) => {
    // trpc.trip.liveTripPositions.subscribe(
    //     {},
    //     {
    //         onData(data) {
    //             console.log(data);
    //         },
    //     }
    // );

    trpc.trip.liveTripStopTime.subscribe(
        [
            {
                tripInstanceId: "68e21cc319d65847f3af09bf",
                stopId: "100731",
            },
        ],
        {
            onData(data) {
                console.log(data);
            },
        }
    );
});

// const result = await trpc.trip.getNearby.query({
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
