import { EventEmitter } from "events";

export type GTFSEventHandler = () => void;

export type GTFSEventType = "rtupdate";

// Create a custom event emitter class
export class GTFSEventEmitter extends EventEmitter {
    // Define the event with typed arguments
    on(event: GTFSEventType, listener: GTFSEventHandler): this {
        return super.on(event, listener);
    }

    emit(event: GTFSEventType): boolean {
        return super.emit(event);
    }
}
