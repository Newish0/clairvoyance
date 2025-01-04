import { type NearbyResponse } from "./types";
import { addMinutes, format } from "date-fns";

const now = new Date();

// export const fakeNearbyResponses: NearbyResponse[] = [
//     {
//         route: { id: "1", short_name: "1", long_name: "Downtown - Uptown", type: 3 },
//         trip: {
//             id: "1A",
//             service_id: "weekday",
//             trip_headsign: "Downtown",
//             trip_short_name: "1D",
//             direction_id: 0,
//             shape_id: "shape1",
//         },
//         stop: { id: "stop1", name: "Main St & 1st Ave", lat: 40.7128, lon: -74.006 },
//         stop_time: {
//             trip_id: "1A",
//             arrival_time: "25:00:00",
//             departure_time: "25:00:00",
//             continuous_pickup: 0,
//             continuous_drop_off: 0,
//             is_last: false,
//             arrival_delay: 2,
//             departure_delay: 2,
//         },
//     },
//     {
//         route: { id: "1", short_name: "1", long_name: "Downtown - Uptown", type: 3 },
//         trip: {
//             id: "1B",
//             service_id: "weekday",
//             trip_headsign: "Uptown",
//             trip_short_name: "1U",
//             direction_id: 1,
//             shape_id: "shape2",
//         },
//         stop: { id: "stop2", name: "Main St & 2nd Ave", lat: 40.7129, lon: -74.0061 },
//         stop_time: {
//             trip_id: "1B",
//             arrival_time: "25:00:00",
//             departure_time: "25:00:00",
//             continuous_pickup: 0,
//             continuous_drop_off: 0,
//             is_last: false,
//             arrival_delay: null,
//             departure_delay: null,
//         },
//     },
//     {
//         route: { id: "2", short_name: "2", long_name: "Crosstown", type: 3 },
//         trip: {
//             id: "2A",
//             service_id: "weekday",
//             trip_headsign: "Eastbound",
//             trip_short_name: "2E",
//             direction_id: 0,
//             shape_id: "shape3",
//         },
//         stop: { id: "stop3", name: "Cross St & 3rd Ave", lat: 40.713, lon: -74.0062 },
//         stop_time: {
//             trip_id: "2A",
//             arrival_time: format(addMinutes(now, 15), "HH:mm:ss"),
//             departure_time: format(addMinutes(now, 16), "HH:mm:ss"),
//             continuous_pickup: 0,
//             continuous_drop_off: 0,
//             is_last: false,
//             arrival_delay: 0,
//             departure_delay: 0,
//         },
//     },
//     {
//         route: { id: "2", short_name: "2", long_name: "Crosstown", type: 3 },
//         trip: {
//             id: "2B",
//             service_id: "weekday",
//             trip_headsign: "Westbound",
//             trip_short_name: "2W",
//             direction_id: 1,
//             shape_id: "shape4",
//         },
//         stop: { id: "stop4", name: "Cross St & 4th Ave", lat: 40.7131, lon: -74.0063 },
//         stop_time: {
//             trip_id: "2B",
//             arrival_time: format(addMinutes(now, 20), "HH:mm:ss"),
//             departure_time: format(addMinutes(now, 21), "HH:mm:ss"),
//             continuous_pickup: 0,
//             continuous_drop_off: 0,
//             is_last: false,
//             arrival_delay: null,
//             departure_delay: null,
//         },
//     },
//     {
//         route: { id: "3", short_name: "3", long_name: "Express", type: 3 },
//         trip: {
//             id: "3A",
//             service_id: "weekday",
//             trip_headsign: "Airport",
//             trip_short_name: "3A",
//             direction_id: 0,
//             shape_id: "shape5",
//         },
//         stop: { id: "stop5", name: "Express Terminal", lat: 40.7132, lon: -74.0064 },
//         stop_time: {
//             trip_id: "3A",
//             arrival_time: format(addMinutes(now, -1), "HH:mm:ss"),
//             departure_time: format(addMinutes(now, -1), "HH:mm:ss"),
//             continuous_pickup: 0,
//             continuous_drop_off: 0,
//             is_last: false,
//             arrival_delay: 5,
//             departure_delay: 5,
//         },
//     },
//     {
//         route: { id: "3", short_name: "3", long_name: "Express", type: 3 },
//         trip: {
//             id: "3B",
//             service_id: "weekday",
//             trip_headsign: "City Center",
//             trip_short_name: "3C",
//             direction_id: 1,
//             shape_id: "shape6",
//         },
//         stop: { id: "stop6", name: "Airport Station", lat: 40.7133, lon: -74.0065 },
//         stop_time: {
//             trip_id: "3B",
//             arrival_time: format(addMinutes(now, 30), "HH:mm:ss"),
//             departure_time: format(addMinutes(now, 31), "HH:mm:ss"),
//             continuous_pickup: 0,
//             continuous_drop_off: 0,
//             is_last: false,
//             arrival_delay: null,
//             departure_delay: null,
//         },
//     },
// ];

const NEARBY_TRANSIT_ENDPOINT = `${import.meta.env.PUBLIC_GTFS_API_ENDPOINT}/nearby`;

export async function getNearbyTransits(
    params: {
        lat?: number;
        lon?: number;
        radius?: number;
        current_time?: string;
        current_date?: string;
    } = {}
) {
    const url = new URL(NEARBY_TRANSIT_ENDPOINT);

    if (!params.current_time) params.current_time = format(new Date(), "HH:mm:ss");
    if (!params.current_date) params.current_date = format(new Date(), "yyyyMMdd");

    Object.keys(params).forEach((key) => url.searchParams.append(key, `${(params as any)[key]}`));

    const res = await fetch(url);
    const json: NearbyResponse[] = await res.json();
    return json;
}
