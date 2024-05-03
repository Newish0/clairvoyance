import { getShapesGeojson } from "@/services/api/transit";
import { globalQueryClient } from "@/services/tanstack";
import { useQuery } from "@tanstack/react-query";

export function useShapesGeojson({
    shapeId,
    routeId,
}: { shapeId?: string; routeId?: string } = {}) {
    return useQuery(
        {
            queryKey: ["transit-shapes-geojson", shapeId, routeId],
            queryFn: () => getShapesGeojson({ shape_id: shapeId, route_id: routeId }),
        },
        globalQueryClient
    );
}
