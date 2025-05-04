import type { VehiclePositionResponse } from "./types";

interface GetRouteVehiclesParams {
    maxAge?: number;
    directionId?: 0 | 1;
}

const VEHICLES_ENDPOINT = `${
    import.meta.env.PUBLIC_GTFS_API_ENDPOINT
}/routes/{{route_id}}/vehicles`;

export async function getRouteVehiclesPositions(
    routeId: string,
    params: GetRouteVehiclesParams = {}
) {
    const url = new URL(VEHICLES_ENDPOINT.replace("{{route_id}}", routeId));

    // Add optional query parameters
    if (params.maxAge !== undefined) {
        url.searchParams.append("max_age", params.maxAge.toString());
    }

    if (params.directionId !== undefined) {
        url.searchParams.append("direction_id", params.directionId.toString());
    }

    try {
        const response = await fetch(url);

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error("No active vehicles found for this route");
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data: VehiclePositionResponse[] = await response.json();

        return data;
    } catch (error) {
        // Re-throw with a more specific message
        throw new Error(
            `Failed to fetch vehicle positions: ${
                error instanceof Error ? error.message : "Unknown error"
            }`
        );
    }
}

interface VehiclePositionSSE extends VehiclePositionResponse {
    removed?: boolean;
}

type VehicleUpdateCallback = (updates: VehiclePositionSSE[]) => void;

/**
 * @example
 * const vehicleService = new VehiclePositionService('http://your-api-base-url');
 *
 * // Subscribe to updates for a specific route
 * const cleanup = vehicleService.subscribeToRouteVehicles('route-1', {
 *     directionId: 0,
 *     onError: (error) => console.error('SSE Error:', error)
 * });
 *
 * // Subscribe to position updates
 * const unsubscribe = vehicleService.subscribe(updates => {
 *     console.log('Vehicle position updates:', updates);
 * });
 *
 * // Later: cleanup when done
 * cleanup();
 * unsubscribe();
 */
export class VehiclePositionService {
    private eventSource: EventSource | null = null;
    private subscribers: Set<VehicleUpdateCallback> = new Set();
    private currentPositions: Map<string, VehiclePositionSSE> = new Map();

    constructor(private baseUrl: string = import.meta.env.PUBLIC_GTFS_API_ENDPOINT) {}

    /**
     * Subscribe to real-time vehicle position updates for a specific route
     * @param routeId The route ID to track
     * @param options Configuration options for the subscription
     * @returns A cleanup function to unsubscribe
     */
    subscribeToRouteVehicles(
        routeId: string,
        options: {
            maxAge?: number;
            directionId?: number;
            updateInterval?: number;
            onError?: (error: any) => void;
        } = {}
    ): () => void {
        const { maxAge = 300, directionId, updateInterval = 5, onError } = options;

        // Build URL with query parameters
        const params = new URLSearchParams({
            max_age: maxAge.toString(),
            update_interval: updateInterval.toString(),
        });
        if (directionId !== undefined) {
            params.append("direction_id", directionId.toString());
        }

        const url = `${this.baseUrl}/routes/${routeId}/vehicles/stream?${params}`;

        // Close existing connection if any
        this.cleanup();

        // Create new EventSource connection
        this.eventSource = new EventSource(url);

        // Handle incoming messages
        this.eventSource.onmessage = (event) => {
            try {
                const updates = JSON.parse(event.data) as VehiclePositionSSE[];

                // Update internal state
                updates.forEach((update) => {
                    if (update.removed) {
                        this.currentPositions.delete(update.vehicle_id);
                    } else {
                        this.currentPositions.set(update.vehicle_id, update);
                    }
                });

                // Notify subscribers
                this.notifySubscribers(updates);
            } catch (error) {
                onError?.(error);
            }
        };

        // Handle errors
        this.eventSource.onerror = (error) => {
            onError?.(error);
        };

        // Return cleanup function
        return () => this.cleanup();
    }

    /**
     * Subscribe to vehicle position updates
     * @param callback Function to be called when vehicle positions are updated
     * @returns A cleanup function to unsubscribe
     */
    subscribe(callback: VehicleUpdateCallback): () => void {
        this.subscribers.add(callback);

        // Immediately send current state to new subscriber
        if (this.currentPositions.size > 0) {
            callback(Array.from(this.currentPositions.values()));
        }

        return () => {
            this.subscribers.delete(callback);
        };
    }

    /**
     * Get current vehicle positions
     * @returns Array of current vehicle positions
     */
    getCurrentPositions(): VehiclePositionSSE[] {
        return Array.from(this.currentPositions.values());
    }

    /**
     * Clean up the SSE connection
     */
    private cleanup(): void {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
    }

    /**
     * Notify all subscribers of updates
     */
    private notifySubscribers(updates: VehiclePositionSSE[]): void {
        this.subscribers.forEach((callback) => {
            try {
                callback(updates);
            } catch (error) {
                console.error("Error in subscriber callback:", error);
            }
        });
    }
}
