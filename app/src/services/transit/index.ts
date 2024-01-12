import { tripsApiDataSchema } from "@/schemas/zod/transit";
import LiveData from "./LiveData";

export async function fetchTrips(query?: { trip_id?: string }) {
    // TODO: implement lat, lon, distance in query
    const res = await fetch(
        new URL("./api/transit/trips", __GTFS_API_ENDPOINT__) + "?" + new URLSearchParams(query)
    );
    const data = await res.json();
    return tripsApiDataSchema.parse(data);
}

export async function fetchStops({
    lat,
    lng,
    radius,
}: {
    lat: number | string;
    lng: number | string;
    radius: number | string;
}) {
    // TODO: implement lat, lon, distance in query
    const res = await fetch(
        new URL("./api/transit/stops", __GTFS_API_ENDPOINT__) +
            "?" +
            new URLSearchParams({
                lat: lat.toString(),
                lng: lng.toString(),
                radius: radius.toString(),
            })
    );
    const data = await res.json();
    return data;
}

export function getRealtimePosition() {
    return LiveData.getInstance(new URL("./api/transit/stream", __GTFS_API_ENDPOINT__));
}
