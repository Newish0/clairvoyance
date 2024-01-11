import { client } from "@/components/nanostores/store";
import { fetchShapes, fetchStops } from "@/services/transit/geojson";
import { fetchTrips, getRealtimePosition } from "@/services/transit";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

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
            queryFn: fetchTrips,
        },
        client
    );
}

export function useRealtimePosition() {
    const liveData = getRealtimePosition();

    const [vehiclePositions, setVehiclePositions] = useState<any[]>([]);

    useEffect(() => {
        const handler = (vehiclePositions: any) => {
            setVehiclePositions(vehiclePositions);
        };

        liveData.subscribe("vehiclePositions", handler);

        return () => {
            liveData.unsubscribe("vehiclePositions", handler);
        };
    }, []);

    return vehiclePositions;
}
