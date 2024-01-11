import { client } from "@/components/nanostores/store";
import { fetchShapes, fetchStops } from "@/services/transit/geojson";
import { fetchTrips, getRealtimePosition } from "@/services/transit";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { vehiclePositionsApiDataSchema } from "@/schemas/zod/transit";
import type { z } from "zod";

export function useStops({ lat, lon, distance }: { lat: number; lon: number; distance: number }) {
    // TODO: implement lat, lon, distance in query

    return useQuery(
        {
            queryKey: ["transit-stops", lat, lon, distance],
            queryFn: fetchStops,
        },
        client
    );
}

export function useShapes({ lat, lon, distance }: { lat: number; lon: number; distance: number }) {
    // TODO: implement lat, lon, distance in query

    return useQuery(
        {
            queryKey: ["transit-shapes", lat, lon, distance],
            queryFn: fetchShapes,
        },
        client
    );
}

export function useTrips({ lat, lon, distance }: { lat: number; lon: number; distance: number }) {
    // TODO: implement lat, lon, distance in query

    return useQuery(
        {
            queryKey: ["transit-trips", lat, lon, distance],
            queryFn: () => fetchTrips(),
        },
        client
    );
}

export function useTrip(tripId: string) {
    return useQuery(
        {
            queryKey: ["transit-trip", tripId],
            queryFn: async () => (await fetchTrips({ trip_id: tripId })).at(0),
        },
        client
    );
}

export function useRealtimePosition() {
    const liveData = getRealtimePosition();

    const [vehiclePositions, setVehiclePositions] = useState<
        z.infer<typeof vehiclePositionsApiDataSchema>
    >([]);

    useEffect(() => {
        const handler = (vehiclePositions: unknown) => {
            setVehiclePositions(vehiclePositionsApiDataSchema.parse(vehiclePositions));
        };

        liveData.subscribe("vehiclePositions", handler);

        return () => {
            liveData.unsubscribe("vehiclePositions", handler);
        };
    }, []);

    return vehiclePositions;
}
