import { useEffect, useState } from "react";



export type NearbyRoute = {
    stop_id: string;
    stop_name: string;
};

type UseNearbyRoutesOptions = {
    lat: number;
    lng: number;
};

export function useNearbyRoutes({ lat, lng }: UseNearbyRoutesOptions) {
    const [nearbyRoutes, setNearbyRoutes] = useState<NearbyRoute[]>([]);

    useEffect(() => {
        const fetchData = async () => {
            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/transit/stops?lat=${lat}&lng=${lng}&radius=0.5`
            );
            const data = await response.json();
            setNearbyRoutes(data);
        };

        fetchData();
    }, [lat, lng]);

    return { nearbyRoutes };
}

