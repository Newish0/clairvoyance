import EndpointEnv from "~/constants/endpoint-env";

export type DirectionId = 0 | 1 | undefined;
export type Vehicle = any; // Lazy type as requested

export type ConnectionStatus = "idle" | "connecting" | "connected" | "disconnected" | "error";

// Define callback types
type UpdateCallback = (vehicles: Map<string, Vehicle>) => void;
type StatusChangeCallback = (status: ConnectionStatus) => void;
type ErrorCallback = (error: Event | string) => void;

export class LiveVehicleWatcher {
    private routeId: string;
    private directionId: DirectionId;
    private apiUrl: string;
    private eventSource: EventSource | null = null;
    private vehicles: Map<string, Vehicle> = new Map();

    // Callbacks
    private onUpdate: UpdateCallback = () => {};
    private onStatusChange: StatusChangeCallback = () => {};
    private onError: ErrorCallback = () => {};

    constructor(routeId: string, directionId: DirectionId) {
        if (!routeId) {
            throw new Error("routeId is required for LiveVehicleService");
        }
        this.routeId = routeId;
        this.directionId = directionId;
        this.apiUrl = this.buildUrl();
        console.debug(
            `LiveVehicleService created for route ${routeId}, direction ${directionId}, url: ${this.apiUrl}`
        );
    }

    // --- Public Methods ---

    /** Registers a callback for vehicle data updates. */
    public setOnUpdate(callback: UpdateCallback): void {
        this.onUpdate = callback;
    }

    /** Registers a callback for connection status changes. */
    public setOnStatusChange(callback: StatusChangeCallback): void {
        this.onStatusChange = callback;
    }

    /** Registers a callback for connection or stream errors. */
    public setOnError(callback: ErrorCallback): void {
        this.onError = callback;
    }

    /** Initiates the SSE connection. */
    public connect(): void {
        if (this.eventSource) {
            console.warn(`[SSE ${this.routeId}] Already connected or connecting.`);
            return;
        }

        try {
            console.log(`[SSE ${this.routeId}] Connecting to ${this.apiUrl}...`);
            this.updateStatus("connecting");
            this.vehicles.clear(); // Clear previous state on new connection attempt
            this.notifyUpdate(); // Notify that state is cleared

            this.eventSource = new EventSource(this.apiUrl);

            this.eventSource.onopen = this.handleOpen;
            this.eventSource.onerror = this.handleError;

            // Listen to specific events from the backend
            this.eventSource.addEventListener("init", this.handleVehicleUpdate);
            this.eventSource.addEventListener("add", this.handleVehicleUpdate);
            this.eventSource.addEventListener("change", this.handleVehicleUpdate);
            this.eventSource.addEventListener("remove", this.handleVehicleRemove);
            this.eventSource.addEventListener("stream_error", this.handleStreamError);
        } catch (error) {
            console.error(`[SSE ${this.routeId}] Failed to create EventSource:`, error);
            this.eventSource = null;
            this.handleError(
                `Failed to create EventSource: ${
                    error instanceof Error ? error.message : String(error)
                }`
            );
        }
    }

    /** Closes the SSE connection. */
    public disconnect(isError: boolean = false): void {
        if (this.eventSource) {
            this.eventSource.close();
            // Explicitly remove listeners to be safe, though close() should handle it
            this.eventSource.removeEventListener("init", this.handleVehicleUpdate);
            this.eventSource.removeEventListener("add", this.handleVehicleUpdate);
            this.eventSource.removeEventListener("change", this.handleVehicleUpdate);
            this.eventSource.removeEventListener("remove", this.handleVehicleRemove);
            this.eventSource.removeEventListener("stream_error", this.handleStreamError);
            this.eventSource.onopen = null;
            this.eventSource.onerror = null;

            this.eventSource = null;
            console.log(`[SSE ${this.routeId}] Disconnected.`);
        }
        // Only update status if not already in an error state causing the disconnect
        if (!isError) {
            this.updateStatus("disconnected");
        }
    }

    // --- Private Helper Methods ---

    private buildUrl(): string {
        // Ensure the environment variable is accessed correctly
        const apiBase = EndpointEnv.GTFS_API_ENDPOINT;
        if (!apiBase) {
            console.error("PUBLIC_GTFS_API_ENDPOINT environment variable is not set!");
            // Fallback or throw error - let's throw for clarity
            throw new Error("API endpoint base URL is not configured.");
        }
        let url = `${apiBase}/routes/${this.routeId}/vehicles/live`;
        if (this.directionId !== undefined && this.directionId !== null) {
            // Explicit check
            url += `?directionId=${this.directionId}`;
        }
        return url;
    }

    private updateStatus(newStatus: ConnectionStatus): void {
        // console.debug(`[SSE ${this.routeId}] Status changed to: ${newStatus}`);
        this.onStatusChange(newStatus);
    }

    private notifyUpdate(): void {
        // Provide a *new* map instance to the callback to ensure reactivity
        // in frameworks like SolidJS that rely on shallow comparison.
        this.onUpdate(new Map(this.vehicles));
    }

    // --- Event Handlers (bound methods using arrow functions) ---

    private handleOpen = (): void => {
        console.log(`[SSE ${this.routeId}] Connection opened.`);
        this.updateStatus("connected");
        // Backend sends 'init' events, no need to clear state here
    };

    private handleError = (error: Event | string): void => {
        // Distinguish between EventSource errors (like connection refused) and string errors passed internally
        const isEvent = error instanceof Event;
        const errorMessage = isEvent ? `EventSource error (type: ${error.type})` : error;

        console.error(`[SSE ${this.routeId}] Error:`, errorMessage, isEvent ? error : "");
        this.onError(error); // Notify listener
        this.updateStatus("error");

        // EventSource attempts reconnection automatically on some errors.
        // However, if the error seems final (e.g., network error, 404), we should clean up.
        // readyState 2 is CLOSED. Check if it's closed after an error event.
        if (this.eventSource?.readyState === EventSource.CLOSED) {
            console.warn(
                `[SSE ${this.routeId}] EventSource closed after error, disconnecting fully.`
            );
            this.disconnect(true); // Pass true to indicate error state
        }
        // If it's an initial connection error passed as a string, disconnect too.
        if (
            !isEvent &&
            typeof error === "string" &&
            error.startsWith("Failed to create EventSource")
        ) {
            this.disconnect(true);
        }
    };

    private handleVehicleUpdate = (event: MessageEvent): void => {
        // console.debug(`[SSE ${this.routeId}] Received ${event.type}:`, event.data);
        try {
            const vehicle: Vehicle = JSON.parse(event.data);
            if (vehicle && typeof vehicle._id !== "undefined") {
                this.vehicles.set(String(vehicle._id), vehicle);
                this.notifyUpdate();
            } else {
                console.warn(
                    `[SSE ${this.routeId}] Received malformed vehicle data for ${event.type}:`,
                    event.data
                );
            }
        } catch (e) {
            console.error(
                `[SSE ${this.routeId}] Failed to parse ${event.type} data:`,
                event.data,
                e
            );
        }
    };

    private handleVehicleRemove = (event: MessageEvent): void => {
        // console.debug(`[SSE ${this.routeId}] Received remove:`, event.data);
        try {
            const data: { _id: string } = JSON.parse(event.data);
            if (data && typeof data._id !== "undefined") {
                const vehicleIdStr = String(data._id);
                if (this.vehicles.has(vehicleIdStr)) {
                    this.vehicles.delete(vehicleIdStr);
                    this.notifyUpdate();
                } else {
                    console.warn(
                        `[SSE ${this.routeId}] Received remove for unknown vehicle ID:`,
                        vehicleIdStr
                    );
                }
            } else {
                console.warn(`[SSE ${this.routeId}] Received malformed remove data:`, event.data);
            }
        } catch (e) {
            console.error(`[SSE ${this.routeId}] Failed to parse remove data:`, event.data, e);
        }
    };

    private handleStreamError = (event: MessageEvent): void => {
        console.error(`[SSE ${this.routeId}] Received stream_error from server:`, event.data);
        let message = "Unknown stream error from server.";
        try {
            const errorData = JSON.parse(event.data);
            message = errorData?.message || message;
        } catch (e) {
            console.error(`[SSE ${this.routeId}] Failed to parse stream_error data:`, e);
        }
        // Treat server-sent error as a critical error for this connection
        this.handleError(`Server stream error: ${message}`);
        // Disconnect after a server stream error, as the stream state might be corrupted
        this.disconnect(true);
    };
}
