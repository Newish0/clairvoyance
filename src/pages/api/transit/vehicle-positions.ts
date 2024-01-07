import type { APIRoute } from "astro";
import { db } from "@/utils/gtfs";
import { getVehiclePositions } from "gtfs";

export const GET: APIRoute = ({ params, request }) => {
    const vehiclePositions = getVehiclePositions({}, [], [], {
        db,
    });
    return new Response(JSON.stringify(vehiclePositions));
};

