import { getRoute, type RouteData } from "@/services/api/transit";
import { useEffect, useState } from "react";

export function useRoute(routeId: string) {
    const [route, setRoute] = useState<RouteData | null>(null);

    useEffect(() => {
        async function fetchRoute() {
            const data = await getRoute(routeId);
            setRoute(data);
        }
        fetchRoute();
    }, [routeId]);

    return { route } as const;
}
