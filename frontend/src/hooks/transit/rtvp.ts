import { getRtvp } from "@/services/api/transit";
import { globalQueryClient } from "@/services/tanstack";
import { useQuery } from "@tanstack/react-query";

export function useRtvp(param: { lat: number; lng: number; radius: number }) {
    const query = useQuery(
        {
            queryKey: ["transit-rtvp", ...Object.values(param)],
            queryFn: () => getRtvp(param),
        },
        globalQueryClient
    );

    return query;
}
