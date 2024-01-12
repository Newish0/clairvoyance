import { client } from "@/components/nanostores/tanstack";
import {
    fetchShapes as fetchShapesGeojson,
    fetchStops as fetchStopsGeojson,
} from "@/services/transit/geojson";
import { fetchStops, fetchTrips, getRealtimePosition } from "@/services/transit";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { vehiclePositionsApiDataSchema } from "@/schemas/zod/transit";
import type { z } from "zod";

export function useStopsGeojson({
    lat,
    lon,
    distance,
}: {
    lat: number;
    lon: number;
    distance: number;
}) {
    // TODO: implement lat, lon, distance in query

    return useQuery(
        {
            queryKey: ["transit-stops-geojson", lat, lon, distance],
            queryFn: fetchStopsGeojson,
        },
        client
    );
}

export function useShapesGeojson({
    lat,
    lon,
    distance,
}: {
    lat: number;
    lon: number;
    distance: number;
}) {
    // TODO: implement lat, lon, distance in query

    return useQuery(
        {
            queryKey: ["transit-shapes-geojson", lat, lon, distance],
            queryFn: fetchShapesGeojson,
        },
        client
    );
}

export function useStops({
    lat,
    lng,
    radius,
}: {
    lat: number | string;
    lng: number | string;
    radius: number | string;
}) {
    return useQuery(
        {
            queryKey: ["transit-stops", lat, lng, radius],
            queryFn: () => fetchStops({ lat, lng, radius }),
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
