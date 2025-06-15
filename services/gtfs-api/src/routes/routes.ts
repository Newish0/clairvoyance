import { fetchRouteLiveVehicles } from "@/services/routeVehiclesService";
import { SSEEvent } from "@/utils/sse";
import { Elysia, t } from "elysia";

// TODO: Fix SSE not closing?
const router = new Elysia().get(
    "routes/:routeId/vehicles/live",
    async function* ({ params: { routeId }, query: { directionId }, set, status }) {
        set.headers["Content-Type"] = "text/event-stream";
        set.headers["Cache-Control"] = "no-cache";
        set.headers["Connection"] = "keep-alive";

        console.log("Starting SSE stream for route", routeId);

        // Flag to track if we should continue the stream
        let shouldContinue = true;

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
        let currentVehiclesMap = new Map<string, any>(initialVehicles.map((v) => [`${v._id}`, v]));

        // Track consecutive errors to avoid infinite retry loops
        let consecutiveErrors = 0;
        const MAX_CONSECUTIVE_ERRORS = 3;

        try {
            // --- Send Initial State ---
            for (const vehicle of currentVehiclesMap.values()) {
                yield SSEEvent({
                    id: String(messageId++),
                    event: "init",
                    data: JSON.stringify(vehicle),
                });
            }

            // Send a ready event to indicate initialization is complete
            yield SSEEvent({
                id: String(messageId++),
                event: "ready",
                data: JSON.stringify({ message: "Stream initialized" }),
            });

            // --- Start Update Loop ---
            while (shouldContinue) {
                try {
                    console.log(`SSE stream for route ${routeId} running...`);

                    // Fetch the latest data
                    const latestVehiclesList = await fetchRouteLiveVehicles(
                        routeId,
                        directionId as 0 | 1 | undefined
                    );

                    // Reset error counter on successful fetch
                    consecutiveErrors = 0;

                    const latestVehiclesMap = new Map<string, any>(
                        latestVehiclesList.map((v) => [`${v._id}`, v])
                    );

                    const nextVehiclesMap = new Map<string, any>();

                    // --- Detect New or Updated Vehicles ---
                    for (const [vehicleId, latestVehicle] of latestVehiclesMap.entries()) {
                        const existingVehicle = currentVehiclesMap.get(vehicleId);

                        if (!existingVehicle) {
                            // Vehicle is New
                            try {
                                yield SSEEvent({
                                    id: String(messageId++),
                                    event: "add",
                                    data: JSON.stringify(latestVehicle),
                                });
                                console.log(`Vehicle ${vehicleId} added`);
                                nextVehiclesMap.set(vehicleId, latestVehicle);
                            } catch (yieldError) {
                                console.log(
                                    `Client disconnected during vehicle add for route ${routeId}`
                                );
                                shouldContinue = false;
                                break;
                            }
                        } else {
                            // Vehicle Exists: Check if updated
                            if (
                                existingVehicle.position_updated_at <
                                latestVehicle.position_updated_at
                            ) {
                                // Vehicle is updated
                                try {
                                    yield SSEEvent({
                                        id: String(messageId++),
                                        event: "change",
                                        data: JSON.stringify(latestVehicle),
                                    });
                                    console.log(`Vehicle ${vehicleId} updated`);
                                    nextVehiclesMap.set(vehicleId, latestVehicle);
                                } catch (yieldError) {
                                    console.log(
                                        `Client disconnected during vehicle update for route ${routeId}`
                                    );
                                    shouldContinue = false;
                                    break;
                                }
                            } else {
                                // Vehicle Exists but Not Updated
                                nextVehiclesMap.set(vehicleId, existingVehicle);
                            }
                        }
                    }

                    // Break out of outer loop if client disconnected
                    if (!shouldContinue) break;

                    // --- Detect Removed Vehicles ---
                    for (const [vehicleId, _] of currentVehiclesMap.entries()) {
                        if (!latestVehiclesMap.has(vehicleId)) {
                            // Vehicle is Removed
                            try {
                                yield SSEEvent({
                                    id: String(messageId++),
                                    event: "remove",
                                    data: JSON.stringify({ _id: vehicleId }),
                                });
                                console.log(`Vehicle ${vehicleId} removed`);
                            } catch (yieldError) {
                                console.log(
                                    `Client disconnected during vehicle removal for route ${routeId}`
                                );
                                shouldContinue = false;
                                break;
                            }
                        }
                    }

                    // Break out of outer loop if client disconnected
                    if (!shouldContinue) break;

                    // --- Update Server State for Next Iteration ---
                    currentVehiclesMap = nextVehiclesMap;

                    // Send heartbeat to keep connection alive
                    try {
                        yield SSEEvent({
                            id: String(messageId++),
                            event: "heartbeat",
                            data: JSON.stringify({ timestamp: Date.now() }),
                        });
                    } catch (yieldError) {
                        console.log(`Client disconnected during heartbeat for route ${routeId}`);
                        shouldContinue = false;
                        break;
                    }
                } catch (fetchError: any) {
                    consecutiveErrors++;
                    console.error(
                        `Fetch error ${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS} for route ${routeId}:`,
                        fetchError
                    );

                    // Send error event to client
                    try {
                        yield SSEEvent({
                            id: String(messageId++),
                            event: "fetch_error",
                            data: JSON.stringify({
                                message: fetchError?.message || "Failed to fetch vehicle data",
                                consecutive_errors: consecutiveErrors,
                            }),
                        });
                    } catch (yieldError) {
                        console.log(`Client disconnected during error send for route ${routeId}`);
                        shouldContinue = false;
                        break;
                    }

                    // Break the loop if too many consecutive errors
                    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                        console.error(
                            `Too many consecutive errors for route ${routeId}, closing stream`
                        );
                        try {
                            yield SSEEvent({
                                id: String(messageId++),
                                event: "stream_error",
                                data: JSON.stringify({
                                    message: "Stream closed due to repeated fetch failures",
                                }),
                            });
                        } catch (yieldError) {
                            console.log(
                                `Client disconnected during final error send for route ${routeId}`
                            );
                        }
                        break;
                    }
                }

                // Wait before polling again
                await Bun.sleep(5000);
            }
        } catch (error: any) {
            console.error(`Error in SSE stream for route ${routeId}:`, error);

            // Only try to send error if we think client is still connected
            if (shouldContinue) {
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
        } finally {
            // Clean up resources if needed
            console.log(
                `SSE stream for route ${routeId} closed. shouldContinue: ${shouldContinue}`
            );
        }
    },
    {
        params: t.Object({
            routeId: t.String(),
        }),
        query: t.Object({
            directionId: t.Optional(
                t.Integer({
                    minimum: 0,
                    maximum: 1,
                })
            ),
        }),
    }
);
export default router;
