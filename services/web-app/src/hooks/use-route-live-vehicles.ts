import { createSignal, onCleanup, createEffect, type Accessor } from "solid-js";
import {
    LiveVehicleWatcher,
    type ConnectionStatus,
    type DirectionId,
    type Vehicle,
} from "~/services/live-vehicle-watcher";

interface UseRouteLiveVehiclesOptions {
    routeId: Accessor<string | undefined | null>; // Allow undefined/null to disable
    directionId?: Accessor<DirectionId>;
}

interface UseRouteLiveVehiclesResult {
    /** Reactive map of live vehicles (id -> vehicle data). */
    vehicles: Accessor<Map<string, Vehicle>>;
    /** Reactive connection status. */
    status: Accessor<ConnectionStatus>;
    /** Reactive error message (string) or Event object. */
    error: Accessor<string | Event | null>;
}

export function useRouteLiveVehicles({
    routeId,
    directionId,
}: UseRouteLiveVehiclesOptions): UseRouteLiveVehiclesResult {
    const [vehicles, setVehicles] = createSignal<Map<string, Vehicle>>(new Map(), {
        equals: false,
    }); // Use equals: false for map updates
    const [status, setStatus] = createSignal<ConnectionStatus>("idle");
    const [error, setError] = createSignal<string | Event | null>(null);

    // Store the service instance ref outside the effect to manage across reruns
    let currentService: LiveVehicleWatcher | null = null;

    createEffect(() => {
        const currentRouteId = routeId(); // Get reactive value
        const currentDirectionId = directionId ? directionId() : undefined;

        // --- 1. Cleanup previous service ---
        if (currentService) {
            console.debug(`[Hook ${currentService}] Cleaning up previous service.`);
            currentService.disconnect();
            currentService = null;
        }

        // Reset state when inputs change or become invalid
        setVehicles(new Map());
        setStatus("idle");
        setError(null);

        // --- 2. Create and connect new service (only if routeId is valid) ---
        if (currentRouteId) {
            try {
                const service = new LiveVehicleWatcher(currentRouteId, currentDirectionId);
                currentService = service; // Store reference

                // Set up callbacks to update signals
                service.setOnUpdate((updatedVehicles) => {
                    // setVehicles triggers update because we create a new Map in notifyUpdate()
                    // and use equals: false on the signal
                    setVehicles(updatedVehicles);
                });

                service.setOnStatusChange((newStatus) => {
                    setStatus(newStatus);
                    // Clear error when connection recovers or disconnects cleanly
                    if (newStatus === "connected" || newStatus === "disconnected") {
                        setError(null);
                    }
                });

                service.setOnError((err) => {
                    // Store the raw error (could be Event or string)
                    setError(err);
                    setStatus("error"); // Ensure status reflects error
                });

                // Start the connection
                service.connect();
            } catch (serviceError) {
                console.error("[Hook] Failed to initialize LiveVehicleService:", serviceError);
                setStatus("error");
                setError(
                    serviceError instanceof Error ? serviceError.message : String(serviceError)
                );
                currentService = null; // Ensure no service ref is held on init error
            }
        } else {
            // If routeId is null/undefined, ensure status is 'disconnected'
            setStatus("disconnected");
        }
    }); // End of createEffect

    // --- 3. Cleanup on component unmount ---
    onCleanup(() => {
        if (currentService) {
            console.debug(`[Hook ${currentService}] Cleaning up service on unmount.`);
            currentService.disconnect();
            currentService = null;
        }
    });

    return { vehicles, status, error };
}
