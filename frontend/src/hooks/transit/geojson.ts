import { getShapesGeojson } from "@/services/api/transit";
import { globalQueryClient } from "@/services/tanstack";
import { useQuery } from "@tanstack/react-query";

export function useShapesGeojson({
    shapeId,
    tripId,
}: { shapeId?: string; tripId?: string } = {}) {
    return useQuery(
        {
            queryKey: ["transit-shapes-geojson", shapeId, tripId],
            queryFn: () => getShapesGeojson({ shape_id: shapeId, trip_id: tripId }),
        },
        globalQueryClient
    );
}
