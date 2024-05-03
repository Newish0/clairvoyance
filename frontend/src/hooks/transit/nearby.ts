import { getNearbyTransits, getRoute, type NearbyTransit } from "@/services/api/transit";

import { useQuery } from "@tanstack/react-query";
import { globalQueryClient } from "@/services/tanstack";

type UseNearbyRoutesOptions = {
    lat: number;
    lng: number;
    radius: number;
};

export function useNearbyTransits({ lat, lng, radius }: UseNearbyRoutesOptions) {
    return useQuery(
        {
            queryKey: ["nearbyTransits", lat, lng, radius],
            queryFn: () => getNearbyTransits(lat, lng, radius),
        },
        globalQueryClient
    );
}
