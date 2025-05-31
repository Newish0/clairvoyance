import { fetchRouteLiveVehicles } from "@/services/routeVehiclesService";
import { SSEEvent } from "@/utils/sse";
import { Elysia, t } from "elysia";

const router = new Elysia().get(
    "routes/:routeId/vehicles/live",
    async function* ({ params: { routeId }, query: { directionId }, set, status }) {
        set.headers["Content-Type"] = "text/event-stream";
        set.headers["Cache-Control"] = "no-cache";
        set.headers["Connection"] = "keep-alive";

        console.log("Starting SSE stream for route", routeId);

        let initialVehicles = [];
        try {
            initialVehicles = await fetchRouteLiveVehicles(
                routeId,
                directionId as 0 | 1 | undefined
            );
        } catch (fetchError) {
            console.error(`Initial fetch failed for route ${routeId}:`, fetchError);
            return status(500, "Failed to fetch initial vehicle data");
        }

        let messageId = 0;

        // Use a Map for efficient lookups and state management
        // Stores the state of vehicles known to the client
        let currentVehiclesMap = new Map<string, any>(initialVehicles.map((v) => [`${v._id}`, v]));

        try {
            // --- Send Initial State ---
            for (const vehicle of currentVehiclesMap.values()) {
                yield SSEEvent({
                    id: String(messageId++),
                    event: "init", // Event for initial vehicle load
                    data: JSON.stringify(vehicle),
                });
            }

            // --- Start Update Loop ---
            while (true) {
                console.log(`SSE stream for route ${routeId} running...`);
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
                        yield SSEEvent({
                            id: String(messageId++),
                            event: "add",
                            data: JSON.stringify(latestVehicle),
                        });
                        console.log(`Vehicle ${vehicleId} added`);
                        nextVehiclesMap.set(vehicleId, latestVehicle); // Add to next state
                    } else {
                        // Vehicle Exists: Check if updated
                        if (
                            existingVehicle.position_updated_at < latestVehicle.position_updated_at
                        ) {
                            // Vehicle is updated
                            yield SSEEvent({
                                id: String(messageId++),
                                event: "change",
                                data: JSON.stringify(latestVehicle),
                            });
                            console.log(`Vehicle ${vehicleId} updated`);
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
                        yield SSEEvent({
                            id: String(messageId++),
                            event: "remove", // Explicit removal event
                            data: JSON.stringify({ _id: vehicleId }), // Send only ID for removal
                        });
                    }
                }

                // --- Update Server State for Next Iteration ---
                currentVehiclesMap = nextVehiclesMap;

                // Wait before polling again
                await Bun.sleep(5000); // 5 seconds interval
            }
        } catch (error: any) {
            console.error(`Error in SSE stream for route ${routeId}:`, error);
            // Attempt to send an error event to the client before closing
            try {
                yield SSEEvent({
                    id: String(messageId++),
                    event: "stream_error",
                    data: JSON.stringify({
                        message: error?.message || "An internal error occurred in the stream.",
                    }),
                });
            } catch (writeError) {
                console.error(`Failed to write error SSE for route ${routeId}:`, writeError);
            }
        }

        console.log(`SSE stream for route ${routeId} closed.`);
    },
    {
        params: t.Object({
            routeId: t.String(),
        }),
        query: t.Object({
            directionId: t.Optional(
                t.Number({
                    minimum: 0,
                    maximum: 1,
                    multipleOf: 1,
                })
            ),
        }),
    }
);

export default router;
