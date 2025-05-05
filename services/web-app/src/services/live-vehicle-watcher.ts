type Vehicle = any; // TODO

interface LiveVehicleWatcherOptions {
    onUpdate?: (vehicles: Map<string, Vehicle>) => void; // Callback with the updated map
    onError?: (error: Event | { message: string }) => void; // Callback for connection or server errors
    onOpen?: () => void; // Callback when connection opens
    onClose?: () => void; // Callback when connection closes explicitly or due to error
}

export class LiveVehicleWatcher {
    private routeId: string;
    private directionId: 0 | 1 | undefined;
    private eventSource: EventSource | null = null;
    private vehicles = new Map<string, Vehicle>();
    private url: string;
    private isConnected = false;

    private onUpdateCallback?: (vehicles: Map<string, Vehicle>) => void;
    private onErrorCallback?: (error: Event | { message: string }) => void;
    private onOpenCallback?: () => void;
    private onCloseCallback?: () => void;

    constructor(routeId: string, directionId?: 0 | 1, options: LiveVehicleWatcherOptions = {}) {
        if (!routeId) {
            throw new Error("routeId is required.");
        }
        this.routeId = routeId;
        this.directionId = directionId;
        this.url = this.buildUrl();

        this.onUpdateCallback = options.onUpdate;
        this.onErrorCallback = options.onError;
        this.onOpenCallback = options.onOpen;
        this.onCloseCallback = options.onClose;
    }

    private buildUrl(): string {
        let url = `${import.meta.env.PUBLIC_GTFS_API_ENDPOINT}/routes/${
            this.routeId
        }/vehicles/live`;
        if (this.directionId !== undefined) {
            url += `?directionId=${this.directionId}`;
        }
        return url;
    }

    connect() {
        if (this.eventSource) {
            console.warn("Already connected or connecting.");
            return;
        }

        console.log(`Connecting to ${this.url}...`);
        this.eventSource = new EventSource(this.url);

        this.eventSource.onopen = () => {
            console.log(`SSE connection opened for route ${this.routeId}`);
            this.isConnected = true;
            // Clear vehicles on reconnect to receive fresh 'init' events
            this.vehicles.clear();
            this.onOpenCallback?.();
            this.notifyUpdate(); // Notify with empty map initially after open
        };

        this.eventSource.onerror = (event) => {
            console.error(`SSE connection error for route ${this.routeId}:`, event);
            this.isConnected = false;
            this.onErrorCallback?.(event);
            this.closeInternal(); // Close and nullify EventSource on error
            this.onCloseCallback?.();
        };

        // --- Custom Event Listeners ---

        this.eventSource.addEventListener("init", (event) => {
            // console.debug("Received 'init' event:", event.data);
            try {
                const vehicle: Vehicle = JSON.parse(event.data);
                if (vehicle && vehicle._id) {
                    this.vehicles.set(vehicle._id, vehicle);
                    this.notifyUpdate();
                } else {
                    console.warn("Received invalid 'init' data:", event.data);
                }
            } catch (e) {
                console.error("Failed to parse 'init' event data:", e, event.data);
            }
        });

        this.eventSource.addEventListener("add", (event) => {
            // console.debug("Received 'add' event:", event.data);
            try {
                const vehicle: Vehicle = JSON.parse(event.data);
                if (vehicle && vehicle._id) {
                    this.vehicles.set(vehicle._id, vehicle);
                    this.notifyUpdate();
                } else {
                    console.warn("Received invalid 'add' data:", event.data);
                }
            } catch (e) {
                console.error("Failed to parse 'add' event data:", e, event.data);
            }
        });

        this.eventSource.addEventListener("change", (event) => {
            // console.debug("Received 'change' event:", event.data);
            try {
                const vehicle: Vehicle = JSON.parse(event.data);
                if (vehicle && vehicle._id) {
                    // Update existing entry
                    this.vehicles.set(vehicle._id, vehicle);
                    this.notifyUpdate();
                } else {
                    console.warn("Received invalid 'change' data:", event.data);
                }
            } catch (e) {
                console.error("Failed to parse 'change' event data:", e, event.data);
            }
        });

        this.eventSource.addEventListener("remove", (event) => {
            // console.debug("Received 'remove' event:", event.data);
            try {
                const data: { _id: string } = JSON.parse(event.data);
                if (data && data._id) {
                    if (this.vehicles.delete(data._id)) {
                        this.notifyUpdate();
                    }
                } else {
                    console.warn("Received invalid 'remove' data:", event.data);
                }
            } catch (e) {
                console.error("Failed to parse 'remove' event data:", e, event.data);
            }
        });

        this.eventSource.addEventListener("stream_error", (event) => {
            // This is for the custom 'stream_error' event sent by the server *before* closing
            console.warn(`Received server error event for route ${this.routeId}:`, event.data);
            try {
                const errorData = JSON.parse(event.data);
                this.onErrorCallback?.(errorData); // Pass the server-sent error details
            } catch (e) {
                console.error("Failed to parse server 'error' event data:", e, event.data);
                // Still notify with a generic error object
                this.onErrorCallback?.({ message: "Received unparsable server error event." });
            }
            // Note: The main 'onerror' handler will likely fire afterwards when the connection drops
        });
    }

    disconnect() {
        console.log(`Disconnecting SSE for route ${this.routeId}...`);
        this.closeInternal();
        if (this.isConnected) {
            this.isConnected = false;
            this.onCloseCallback?.();
        }
    }

    private closeInternal() {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
    }

    private notifyUpdate() {
        // Provide a *copy* of the map to the callback to prevent external mutation
        this.onUpdateCallback?.(new Map(this.vehicles));
    }

    public getIsConnected(): boolean {
        return this.isConnected;
    }

    public getCurrentVehicles(): Map<string, Vehicle> {
        // Return a copy
        return new Map(this.vehicles);
    }
}
