import type { APIRoute } from "astro";
import { db } from "@/utils/backend-gtfs";
import { getStopsAsGeoJSON } from "gtfs";

export const GET: APIRoute = async ({ params, request }) => {
    const stopsGeojson = await getStopsAsGeoJSON({}, { db });
    return new Response(JSON.stringify(stopsGeojson));
};

