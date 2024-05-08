import { getRtvpByLoc, getRtvpByTripId } from "@/services/api/transit";
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

export function useRtvpByTripId(trip_id: string) {
    const query = useQuery(
        {
            queryKey: ["transit-rtvp", trip_id],
            queryFn: () => getRtvpByTripId(trip_id),
        },
        globalQueryClient
    );

    return query;
}
