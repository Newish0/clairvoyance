import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { fetchRouteLiveVehicles } from "@/services/routeVehiclesService";
import { streamSSE } from "hono/streaming";

const router = new Hono();

// GET /routes/:routeId/vehicles/live?directionId=
router.get(
    "/:routeId/vehicles/live",
    zValidator("param", z.object({ routeId: z.string() })),
    zValidator("query", z.object({ directionId: z.enum(["0", "1"]).transform(Number).optional() })),
    async (c) => {
        const { routeId } = c.req.valid("param");

        // directionId will be correctly typed as 0 | 1 | undefined
        const { directionId } = c.req.valid("query");

        let initialVehicles = [];
        try {
            initialVehicles = await fetchRouteLiveVehicles(
                routeId,
                directionId as 0 | 1 | undefined
            );
        } catch (fetchError) {
            console.error(`Initial fetch failed for route ${routeId}:`, fetchError);
            // Return an error response immediately if initial fetch fails
            return c.json({ error: "Failed to fetch initial vehicle data" }, 500);
        }

        let messageId = 0;

        return streamSSE(c, async (stream) => {
            // Use a Map for efficient lookups and state management
            // Stores the state of vehicles known to the client
            let currentVehiclesMap = new Map<string, any>(
                initialVehicles.map((v) => [`${v._id}`, v])
            );

            try {
                // --- Send Initial State ---
                for (const vehicle of currentVehiclesMap.values()) {
                    await stream.writeSSE({
                        id: String(messageId++),
                        event: "init", // Event for initial vehicle load
                        data: JSON.stringify(vehicle),
                    });
                }

                // --- Start Update Loop ---
                while (true) {
                    // Fetch the latest data
                    const latestVehiclesList = await fetchRouteLiveVehicles(
                        routeId,
                        directionId as 0 | 1 | undefined
                    );
                    const latestVehiclesMap = new Map<string, any>(
                        latestVehiclesList.map((v) => [`${v._id}`, v])
                    );

                    // Map to build the state for the *next* iteration
                    const nextVehiclesMap = new Map<string, any>();

                    // --- Detect New or Updated Vehicles ---
                    for (const [vehicleId, latestVehicle] of latestVehiclesMap.entries()) {
                        const existingVehicle = currentVehiclesMap.get(vehicleId);

                        if (!existingVehicle) {
                            // Vehicle is New
                            await stream.writeSSE({
                                id: String(messageId++),
                                event: "add",
                                data: JSON.stringify(latestVehicle),
                            });
                            nextVehiclesMap.set(vehicleId, latestVehicle); // Add to next state
                        } else {
                            // Vehicle Exists: Check if updated
                            if (
                                existingVehicle.last_realtime_update_timestamp <
                                latestVehicle.last_realtime_update_timestamp
                            ) {
                                // Vehicle is updated
                                await stream.writeSSE({
                                    id: String(messageId++),
                                    event: "change",
                                    data: JSON.stringify(latestVehicle),
                                });
                                nextVehiclesMap.set(vehicleId, latestVehicle); // Add updated version to next state
                            } else {
                                // Vehicle Exists but Not Updated: Keep existing version in state
                                nextVehiclesMap.set(vehicleId, existingVehicle);
                            }
                        }
                    }

                    // --- Detect Removed Vehicles ---
                    for (const [vehicleId, _] of currentVehiclesMap.entries()) {
                        if (!latestVehiclesMap.has(vehicleId)) {
                            // Vehicle is Removed
                            await stream.writeSSE({
                                id: String(messageId++),
                                event: "remove", // Explicit removal event
                                data: JSON.stringify({ _id: vehicleId }), // Send only ID for removal
                            });
                        }
                    }

                    // --- Update Server State for Next Iteration ---
                    currentVehiclesMap = nextVehiclesMap;

                    // Wait before polling again
                    await stream.sleep(5000); // 5 seconds interval
                }
            } catch (error: any) {
                console.error(`Error in SSE stream for route ${routeId}:`, error);
                // Attempt to send an error event to the client before closing
                try {
                    await stream.writeSSE({
                        id: String(messageId++),
                        event: "stream_error",
                        data: JSON.stringify({
                            message: error?.message || "An internal error occurred in the stream.",
                        }),
                    });
                } catch (writeError) {
                    console.error(`Failed to write error SSE for route ${routeId}:`, writeError);
                }
            } finally {
                stream.close();
            }
        });
    }
);
export default router;
