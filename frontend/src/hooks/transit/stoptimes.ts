import { getStopTimesByRoute } from "@/services/api/transit";
import { globalQueryClient } from "@/services/tanstack";
import { useQuery } from "@tanstack/react-query";

export function useStopTimesByRouteId(routeId: string, stopId?: string | number) {
    const query = useQuery(
        {
            queryKey: ["transit-stoptimes", routeId, stopId],
            queryFn: () => getStopTimesByRoute(routeId, stopId),
        },
        globalQueryClient
    );
    return query;
}
