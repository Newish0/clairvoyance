import type { ScheduledTripDocument } from "gtfs-db-types";


export type ScheduledTripDocumentWithStopName = Omit<ScheduledTripDocument, "stop_times"> & {
    stop_times?: (ScheduledTripDocument["stop_times"][0] & {
        stop_name?: string;
    })[];
};