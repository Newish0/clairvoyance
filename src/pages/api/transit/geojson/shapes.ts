import type { APIRoute } from "astro";
import { db } from "@/utils/gtfs";
import { getShapesAsGeoJSON } from "gtfs";

export const GET: APIRoute = async ({ params, request }) => {
    const shapesGeojson = await getShapesAsGeoJSON({}, { db });
    return new Response(JSON.stringify(shapesGeojson));
};
