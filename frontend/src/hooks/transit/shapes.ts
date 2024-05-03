import { getShapes } from "@/services/api/transit";
import { globalQueryClient } from "@/services/tanstack";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

export function useShapes({ shapeId, routeId }: { shapeId?: string; routeId?: string } = {}) {
    const query = useQuery(
        {
            queryKey: ["transit-shapes", shapeId, routeId],
            queryFn: () => getShapes({ shape_id: shapeId, route_id: routeId }),
        },
        globalQueryClient
    );

    return query;
}
