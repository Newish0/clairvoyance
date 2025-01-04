import { createEffect, createResource, createSignal, onCleanup, type Accessor } from "solid-js";
import { VehiclePositionService } from "~/services/gtfs/vehicle";

export function useVehiclePositions(
    routeId: Accessor<string | undefined>,
    directionId: Accessor<0 | 1 | undefined>
) {
    const vehicleService = new VehiclePositionService();
    let cleanupFuncs: (() => void)[] = [];

    const [vehiclePositions, setVehiclePositions] = createSignal<
        ReturnType<VehiclePositionService["getCurrentPositions"]>
    >([]);

    // Subscribe to position updates before establishing stream
    const unsubscribe = vehicleService.subscribe((updates) => {
        console.log("Vehicle position updates:", updates);

        setVehiclePositions(updates);
    });

    createEffect(() => {
        if (!routeId() || directionId() == undefined) return;

        // Subscribe to updates for a specific route
        const cleanup = vehicleService.subscribeToRouteVehicles(routeId()!, {
            directionId: directionId()!,
            onError: (error) => console.error("SSE Error:", error),
        });

        cleanupFuncs.push(cleanup);
    });

    // Later: cleanup when done
    onCleanup(() => {
        cleanupFuncs.forEach((cleanup) => cleanup());
        unsubscribe();
    });

    return vehiclePositions;
}
