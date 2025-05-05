import { createSignal, createEffect, onCleanup, type Accessor } from "solid-js";
import { LiveVehicleWatcher } from "@/services/live-vehicle-watcher";

type DirectionId = 0 | 1 | undefined;
type Vehicle = any; // TODO

// Type for the hook's return value
export interface LiveVehicleData {
    vehicles: Accessor<Vehicle[]>; // Provide vehicles as an array for easier iteration in components
    isConnected: Accessor<boolean>;
    error: Accessor<any | null>; // Can hold Event or server error message object
}

// Hook definition
export function useRouteLiveVehicles(
    routeIdAccessor: Accessor<string | null | undefined>,
    directionIdAccessor: Accessor<DirectionId>
): LiveVehicleData {
    const [vehicles, setVehicles] = createSignal<Vehicle[]>([]);
    const [isConnected, setIsConnected] = createSignal<boolean>(false);
    const [error, setError] = createSignal<any | null>(null);

    let watcher: LiveVehicleWatcher | null = null;

    createEffect(() => {
        // Get reactive values
        const routeId = routeIdAccessor();
        const directionId = directionIdAccessor();

        // --- Cleanup previous watcher ---
        // This runs before the effect body runs again, or when the component unmounts
        if (watcher) {
            watcher.disconnect();
            watcher = null;
            // Reset state when inputs change or connection is intentionally stopped
            setVehicles([]);
            setIsConnected(false);
            setError(null);
        }

        // Only proceed if routeId is valid
        if (!routeId) {
            console.log("[Hook Effect] No routeId provided, skipping connection.");
            return; // Don't connect if routeId is null/undefined
        }

        console.log(
            `[Hook Effect] Setting up watcher for route: ${routeId}, direction: ${directionId}`
        );

        // --- Create and connect new watcher ---
        watcher = new LiveVehicleWatcher(routeId, directionId, {
            onUpdate: (vehicleMap) => {
                // Convert map values to an array for the signal
                setVehicles(Array.from(vehicleMap.values()));
            },
            onOpen: () => {
                setIsConnected(true);
                setError(null); // Clear error on successful connection
                console.log(`[Hook Callback] Connection opened for route ${routeId}`);
            },
            onError: (err) => {
                setIsConnected(false);
                setError(err); // Store the error event or message
                console.error(`[Hook Callback] Error for route ${routeId}:`, err);
            },
            onClose: () => {
                setIsConnected(false);
                console.log(`[Hook Callback] Connection closed for route ${routeId}`);
                if (!error()) {
                    setError({ message: "Connection closed." });
                }
            },
        });

        // Store the current watcher instance to be cleaned up by the next effect run or unmount
        const currentWatcher = watcher;
        watcher.connect();

        // Explicit cleanup function for component unmount
        // This overlaps with the effect's built-in cleanup but ensures cleanup on unmount
        onCleanup(() => {
            currentWatcher.disconnect();
            // Reset state on unmount
            setVehicles([]);
            setIsConnected(false);
            setError(null);
            if (watcher === currentWatcher) {
                watcher = null; // Ensure the main watcher variable is cleared if this is the active one
            }
        });
    }); // Dependencies: routeIdAccessor, directionIdAccessor

    return {
        vehicles,
        isConnected,
        error,
    };
}
