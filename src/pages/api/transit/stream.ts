/**
 * Route: `api/transit/stream`
 *
 * Description: An SSE route for providing live data. To be used with SSESubscriber class in frontend.
 *
 * Reference: https://github.com/MicroWebStacks/astro-examples/blob/main/03_sse-counter/src/pages/api/stream.js
 *
 */

import type { APIRoute } from "astro";
import { db, on, off, type GTFSEventHandler } from "@/utils/backend-gtfs";
import { getVehiclePositions } from "gtfs";

export const GET: APIRoute = ({ params, request }) => {
    let updateHandler: GTFSEventHandler | null = null;

    const stream = new ReadableStream({
        start(controller) {
            updateHandler = () => {
                const vehiclePositions = getVehiclePositions({}, [], [], {
                    db,
                });

                const payload =
                    "event: vehiclePositions" +
                    "\n" +
                    `data: ${JSON.stringify(vehiclePositions)}\n\n`;

                controller.enqueue(payload);
            };

            on("rtupdate", updateHandler);
            updateHandler();
        },
        cancel() {
            if (updateHandler) off("rtupdate", updateHandler);
        },
    });

    return new Response(stream, {
        status: 200,
        headers: {
            "Content-Type": "text/event-stream",
            Connection: "keep-alive",
            "Cache-Control": "no-cache",
        },
    });
};
