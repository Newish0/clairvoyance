import type { APIRoute } from "astro";
import { db } from "@/utils/backend-gtfs";
import { getRoutes } from "gtfs";



export const GET: APIRoute = ({ params, request }) => {
    const routes = getRoutes(
        {}, // No query filters
        [],
        // ['route_id', 'route_short_name', 'route_color'], // Only return these fields
        [["route_short_name", "ASC"]], // Sort by this field and direction
        { db } // Options for the query. Can specify which database to use if more than one are open
    );
    return new Response(JSON.stringify(routes));
};
