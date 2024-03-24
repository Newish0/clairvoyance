type LiveDataFields = "vehiclePositions";

type DataHandler = (newData: unknown) => void;

export default class LiveData {
    private static store = new Map<string, LiveData>();

    private static eventSource: EventSource | null = null;
    private subscriptions: Map<string, Array<DataHandler>>;

    private sseEndPoint: string;

    private constructor(sseEndPoint: string) {
        this.sseEndPoint = sseEndPoint;
        this.subscriptions = new Map();
        LiveData.createEventSource(this.sseEndPoint);
    }

    public static getInstance(sseEndPoint: string | URL): LiveData {
        if (!LiveData.store.has(sseEndPoint.toString())) {
            LiveData.store.set(sseEndPoint.toString(), new LiveData(sseEndPoint.toString()));
        }
        return LiveData.store.get(sseEndPoint.toString())!;
    }

    public subscribe(field: LiveDataFields, handler: DataHandler) {
        if (!this.subscriptions.has(field)) this.subscriptions.set(field, []);
        this.subscriptions.get(field)?.push(handler);
    }

    public unsubscribe(field: LiveDataFields, handler: DataHandler) {
        if (!this.subscriptions.has(field)) return;
        const index = this.subscriptions.get(field)?.indexOf(handler);
        if (index !== undefined && index > -1) this.subscriptions.get(field)?.splice(index, 1);
    }

    /**
     * Handle incoming SSE events and dispatch them to the subscribed callbacks.
     * @param {Record<string, unknown>} data - The data received from the SSE event.
     */
    private handleEvent(field: LiveDataFields, data: unknown): void {
        this.subscriptions.get(field)?.forEach((cb) => cb(data));
    }

    /**
     * Create or recreate the EventSource based on the current subscriptions.
     * @param {string} url - The SSE URL.
     */
    private static createEventSource(url: string): void {
        if (LiveData.eventSource) {
            LiveData.eventSource.close();
        }

        const evtSource = new EventSource(url);

        evtSource.onopen = (evt) => {
            console.debug("[LiveData] EventSource opened at", url);
        };

        evtSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            console.warn("[LiveData] Unnamed event. No handler for the following data. \n", data);
        };

        evtSource.onerror = (err) => {
            console.error("[LiveData] EventSource failed:", err);
            evtSource.close();
        };

        window.onbeforeunload = () => {
            console.log("[LiveData] Closing gracefully for", url);
            evtSource.close();
        };

        evtSource.addEventListener("vehiclePositions", (evt) => {
            LiveData.store.forEach((instance) =>
                instance.handleEvent("vehiclePositions", JSON.parse(evt.data))
            );
        });
    }
}
