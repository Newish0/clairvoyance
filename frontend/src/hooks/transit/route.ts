import { getRoute, type RouteData } from "@/services/api/transit";
import { globalQueryClient } from "@/services/tanstack";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export function useRoute(routeId: string) {
    return useQuery(
        {
            queryKey: ["route", routeId],
            queryFn: () => getRoute(routeId),
        },
        globalQueryClient
    );
}
