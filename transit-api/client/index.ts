import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "../server/src/index";

const trpc = createTRPCClient<AppRouter>({
    links: [
        httpBatchLink({
            url: "http://localhost:3000",
        }),
    ],
});

const result = await trpc.trip.getNearby.query({
    lat: 48.474515,
    lng: -123.354458,
    radius: 1000,
});
// console.log(JSON.stringify(getObjectTypes(result), null, 2));
console.log(JSON.stringify(result, null, 2));

function getObjectTypes(obj: any, typeObject: any = {}) {
    for (const key in obj) {
        if (Array.isArray(obj[key])) {
            if (obj[key].length > 0) {
                const item = obj[key][0];
                if (typeof item === "object" && item !== null) {
                    const newTypeObject = getObjectTypes(item, {});
                    typeObject[key] = [newTypeObject];
                } else {
                    typeObject[key] = [typeof item];
                }
            } else {
                typeObject[key] = [];
            }
        } else if (typeof obj[key] === "object" && obj[key] !== null) {
            const newTypeObject = getObjectTypes(obj[key], {});
            typeObject[key] = newTypeObject;
        } else {
            typeObject[key] = typeof obj[key];
        }
    }
    return typeObject;
}
