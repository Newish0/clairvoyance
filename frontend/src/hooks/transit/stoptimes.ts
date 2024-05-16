import { getStopTimesByRoute, getStopTimesByTrip } from "@/services/api/transit";
import { globalQueryClient } from "@/services/tanstack";
import { useQuery } from "@tanstack/react-query";

export function useStopTimesByRoute(routeId: string, stopId?: string | number) {
    const query = useQuery(
        {
            queryKey: ["transit-stoptimes", routeId, stopId],
            queryFn: () => getStopTimesByRoute(routeId, stopId),
        },
        globalQueryClient
    );
    return query;
}

export function useStopTimesByTrip(tripId: string) {
    const query = useQuery(
        {
            queryKey: ["transit-stoptimes", tripId],
            queryFn: () => getStopTimesByTrip(tripId),
        },
        globalQueryClient
    );
    return query;
}
