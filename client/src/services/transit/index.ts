import { tripsApiDataSchema } from "@/schemas/zod/transit";
import LiveData from "./LiveData";

export async function fetchTrips() {
    // TODO: implement lat, lon, distance in query
    const res = await fetch(new URL("./api/transit/trips", __GTFS_API_ENDPOINT__));
    const data = await res.json();
    return tripsApiDataSchema.parse(data);
}

export function getRealtimePosition() {
    return LiveData.getInstance(new URL("./api/transit/stream", __GTFS_API_ENDPOINT__));
}
