import {
    getRtvpByLoc,
    getRtvpByRouteId,
    getRtvpByTripId,
    getRtvpEta,
} from "@/services/api/transit";
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

export function useRtvpEta(tripId: string, stopId: string) {
    const query = useQuery(
        {
            queryKey: ["transit-rtvp-eta", tripId, stopId],
            queryFn: () => getRtvpEta(tripId, stopId),
        },
        globalQueryClient
    );

    return query;
}
