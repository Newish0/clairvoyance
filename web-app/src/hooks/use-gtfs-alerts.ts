import { createResource } from "solid-js";
import {
    getAnyActiveAlertsByEntitySelector,
    type GetActiveAlertsByEntitySelector,
} from "~/services/alerts";

export function useGtfsAlerts(params: GetActiveAlertsByEntitySelector) {
    const [agencyAlerts] = createResource(
        () => params.agencyId,
        async (id) => getAnyActiveAlertsByEntitySelector({ agencyId: id })
    );

    const [activeAlerts] = createResource(
        () => ({
            directionId: ourTrip()?.direction_id as "0" | "1" | undefined,
            routeId: finalProps.routeId,

            // TODO: Figure out a way to properly matches even if no trip id
            // tripId: ourTrip()?.trip_id,
            // startDate: ourTrip()?.start_date,
            // startTime: ourTrip()?.start_time,
            stopIds: ourTrip()?.stop_times.map((st) => st.stop_id),
        }),
        async (params) => getAnyActiveAlertsByEntitySelector(params)
    );
}
