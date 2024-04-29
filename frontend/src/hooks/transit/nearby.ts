import { useEffect, useState } from "react";

export type NearbyTransit = {
    stop_id: string;
    stop_name: string;
    stop_lat: number;
    stop_lon: number;
    route_id: number;
    route_short_name: string;
    route_long_name: string;
};

type UseNearbyRoutesOptions = {
    lat: number;
    lng: number;
    radius: number;
};

export function useNearbyTransits({ lat, lng, radius }: UseNearbyRoutesOptions) {
    const [nearbyRoutes, setNearbyRoutes] = useState<NearbyTransit[]>([]);

    useEffect(() => {
        // const fetchData = async () => {
        //     const response = await fetch(
        //         `${import.meta.env.VITE_API_URL}/transit/stops?lat=${lat}&lng=${lng}&radius=0.5`
        //     );
        //     const data = await response.json();
        //     setNearbyRoutes(data);
        // };

        // fetchData();

        setNearbyRoutes([
            {
                stop_id: "1",
                stop_name: "Douglas St at Boleskine Rd - Uptown",
                stop_lat: 48.45322,
                stop_lon: -123.3759,
                route_id: 1,
                route_short_name: "95",
                route_long_name: "Langford / Downtown Blink",
            },
            {
                stop_id: "2",
                stop_name: "Saanich Rd at Blanshard St - Uptown",
                stop_lat: 48.45497,
                stop_lon: -123.37295,
                route_id: 2,
                route_short_name: "26",
                route_long_name: "Dockyard / UVic",
            },
        ]);
    }, [lat, lng]);

    return { nearbyRoutes };
}
