import axios from "axios";

export type NearbyTransit = {
    stop_id: string | number;
    stop_name: string;
    stop_lat: number;
    stop_lon: number;
    route_id: string | number;
    route_short_name: string;
    route_long_name: string;
};

export const getNearbyTransits = async (
    lat: number,
    lng: number,
    radius: number
): Promise<NearbyTransit[]> => {
    // TODO: implement lat, lon, distance in query
    // const { data } = await axios.get<NearbyTransit[]>(
    //     `${import.meta.env.PUBLIC_GTFS_API_URL}/stops`,
    //     { params: { lat, lng, radius } }
    // );

    const data = [
        {
            stop_id: "1",
            stop_name: "Douglas St at Boleskine Rd - Uptown",
            stop_lat: 48.45322,
            stop_lon: -123.3759,
            route_id: "95-VIC",
            route_short_name: "95",
            route_long_name: "Langford / Downtown Blink",
        },
        {
            stop_id: "2",
            stop_name: "Saanich Rd at Blanshard St - Uptown",
            stop_lat: 48.45497,
            stop_lon: -123.37295,
            route_id: "26-VIC",
            route_short_name: "26",
            route_long_name: "Dockyard / UVic",
        },
    ];

    return data;
};

export type RouteData = {
    route_id: string;
    route_short_name: string;
    route_long_name: string;
};

export const getRoute = async (route_id: string | number): Promise<RouteData> => {
    // const { data } = await axios.get<Record<string, unknown>>(
    //     `${import.meta.env.PUBLIC_GTFS_API_URL}/routes`,
    //     { params: { route_id } }
    // );

    const data = {
        route_id: "95-VIC",
        route_short_name: "95",
        route_long_name: "Langford / Downtown Blink",
    };
    return data;
};

export const getTrips = async ({
    trip_id,
    route_id,
}: { trip_id?: string; route_id?: string } = {}) => {
    const { data } = await axios.get<Array<Record<string, unknown>>>(
        `${import.meta.env.PUBLIC_GTFS_API_URL}/trips`,
        { params: { trip_id, route_id } }
    );
    return data;
};

export type Shape = {
    shape_id: string;
    shape_pt_sequence: number;
    shape_pt_lat: number;
    shape_pt_lon: number;
    shape_dist_traveled?: number;
};

export const getShapes = async ({
    shape_id,
    route_id,
}: { shape_id?: string; route_id?: string } = {}): Promise<Shape[] | null> => {
    if (!shape_id && !route_id) return null;

    const { data } = await axios.get<Record<string, unknown>>(
        `${import.meta.env.PUBLIC_GTFS_API_URL}/shapes`,
        { params: { shape_id, route_id } }
    );
    return data as Shape[];
};

export const getShapesGeojson = async ({
    shape_id,
    route_id,
}: { shape_id?: string; route_id?: string } = {}): Promise<any> => {
    if (!shape_id && !route_id) return null;

    const { data } = await axios.get<Record<string, unknown>>(
        `${import.meta.env.PUBLIC_GTFS_API_URL}/geojson/shapes`,
        { params: { shape_id, route_id } }
    );
    return data;
};

export const getRtvp = async (params: { lat: number; lng: number; radius: number }) => {
    const { data } = await axios.get<Record<string, unknown>>(
        `${import.meta.env.PUBLIC_GTFS_API_URL}/rtvp`,
        { params }
    );
    return data;
};
