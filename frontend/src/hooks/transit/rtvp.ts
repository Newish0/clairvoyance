import { getRtvpByLoc, getRtvpByRouteId, getRtvpByTripId } from "@/services/api/transit";
import { globalQueryClient } from "@/services/tanstack";
import { useQuery } from "@tanstack/react-query";

export function useRtvpByLoc(param: { lat: number; lng: number; radius: number }) {
    const query = useQuery(
        {
            queryKey: ["transit-rtvp", ...Object.values(param)],
            queryFn: () => getRtvpByLoc(param),
        },
        globalQueryClient
    );

    return query;
}

export function useRtvpByTripId(tripId: string) {
    const query = useQuery(
        {
            queryKey: ["transit-rtvp", tripId],
            queryFn: () => getRtvpByTripId(tripId),
        },
        globalQueryClient
    );

    return query;
}

export function useRtvpByRouteId(routeId: string, directionId: number) {
    const query = useQuery(
        {
            queryKey: ["transit-rtvp", routeId],
            queryFn: () => getRtvpByRouteId(routeId, directionId),
        },
        globalQueryClient
    );

    return query;
}
