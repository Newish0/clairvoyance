import axios, { type AxiosResponse } from "axios";

export type NearbyTransit = {
    route_id: string;
    route_short_name: string;
    route_long_name: string;
    route_type: number;
    route_color: string;
    route_text_color: string;
    agency_id: string;
    trips: {
        trip_id: string;
        trip_headsign: string;
        direction_id: number;
        shape_id: string;
        route_id: string;
        agency_id: string;
        stop_time: {
            arrival_time: string;
            arrival_timestamp: number;
            departure_time: string;
            departure_timestamp: number;
            stop_id: string;
            stop_sequence: number;
            stop_headsign: string;
            pickup_type: number;
            drop_off_type: number;
            shape_dist_traveled: number;
            stop: {
                stop_id: string;
                stop_name: string;
                stop_lat: number;
                stop_lon: number;
                location_type: number;
                parent_station: string;
                agency_id: string;
            };
            p_traveled: number; 
        };
        rtvp: {
            trip_id: string | null;
            rtvp_id: number;
            bearing: number | null;
            latitude: number | null;
            longitude: number | null;
            speed: number | null;
            vehicle_id: string;
            timestamp: Date;
            is_updated: number;
            p_traveled: number | null;
            trip_update_id: number;
        } | null;
    }[];
};

export const getNearbyTransits = async (
    lat: number,
    lng: number,
    radius: number
): Promise<NearbyTransit[]> => {
    const { data } = await axios.get<NearbyTransit[]>(
        `${import.meta.env.PUBLIC_GTFS_API_URL}/transits/nearby`,
        { params: { lat, lng, radius } }
    );

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

export type TripData =
    | {
          trip_id: string;
          route_id: string;
          service_id: string;
          trip_headsign: string | null;
          trip_short_name: string | null;
          direction_id: number | null;
          block_id: string | null;
          shape_id: string | null;
          wheelchair_accessible: number | null;
          bikes_allowed: number | null;
          route?: RouteData | null;
      }
    | undefined;

export const getTrips = async ({
    trip_id,
    route_id,
}: { trip_id?: string; route_id?: string } = {}) => {
    const { data } = await axios.get<Array<TripData>>(
        `${import.meta.env.PUBLIC_GTFS_API_URL}/trips`,
        { params: { trip_id, route_id } }
    );
    return data;
};

export const getTrip = async (trip_id: string, { with_route }: { with_route?: boolean } = {}) => {
    const { data } = await axios.get<TripData>(
        `${import.meta.env.PUBLIC_GTFS_API_URL}/trips/${trip_id}`,
        {
            params: { with_route },
        }
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

export type RTVPData = {
    rtvp_id: number;
    bearing: number;
    latitude: number;
    longitude: number;
    speed: number;
    trip_id: string;
    vehicle_id: string;
    timestamp: string;
    is_updated: number;
    p_traveled: number;
    rel_timestamp: number;
    distance: number;
};

export const getRtvpByLoc = async (params: { lat: number; lng: number; radius: number }) => {
    const res: AxiosResponse<RTVPData[], unknown> = await axios.get(
        `${import.meta.env.PUBLIC_GTFS_API_URL}/rtvp/loc`,
        { params }
    );
    return res.data;
};

export const getRtvpByTripId = async (tripId: string) => {
    const res: AxiosResponse<RTVPData[], unknown> = await axios.get(
        `${import.meta.env.PUBLIC_GTFS_API_URL}/rtvp/trip/${tripId}`
    );
    return res.data;
};

export const getRtvpByRouteId = async (routeId: string, directionId: number) => {
    const res: AxiosResponse<RTVPData[], unknown> = await axios.get(
        `${import.meta.env.PUBLIC_GTFS_API_URL}/rtvp/route/${routeId}?direction_id=${directionId}`
    );
    return res.data;
};

type RtvpEta = {
    stop_id: string;
    trip_id: string;
    stopDistanceTraveled: number;
    lastStopDistanceTraveled: number;
    pTraveled: number;
    predictedElapsedAtStop: number;
    eta: number;
};

export const getRtvpEta = async (tripId: string, stopId: string) => {
    if (!tripId || !stopId) return null;

    const res: AxiosResponse<RtvpEta, unknown> = await axios.get(
        `${import.meta.env.PUBLIC_GTFS_API_URL}/rtvp/eta?trip_id=${tripId}&stop_id=${stopId}`
    );
    return res.data;
};
