import { type Component } from "solid-js";
import { TripInfo } from "./TripInfo";
import { StopInfo } from "./StopInfo";
import { OtherTrips } from "./OtherTrips";
import type { TripDetailProps } from "~/types"; // Adjust the import based on your types file structure

export const TripDetails: Component<TripDetailProps> = (props) => {
    const { tripId, routeId, stopId } = props;

    // Fetch trip details, route details, and stop times here using the services
    // You can use createResource or createEffect to manage the data fetching

    return (
        <div class="p-4">
            <TripInfo tripId={tripId} routeId={routeId} />
            <StopInfo stopId={stopId} />
            <OtherTrips stopId={stopId} />
        </div>
    );
};