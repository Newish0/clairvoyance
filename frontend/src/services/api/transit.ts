import { coordsToGeoJsonLine } from "@/utils/geojson";
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
            stop_time_update: {
                trip_id: string | null;
                trip_start_time: string | null;
                direction_id: number | null;
                route_id: string | null;
                stop_id: string | null;
                stop_sequence: number | null;
                arrival_delay: number | null;
                departure_delay: number | null;
                departure_timestamp: string | null;
                arrival_timestamp: string | null;
                schedule_relationship: string | null;
                is_updated: number;
            } | null;
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
    agency_id: string | null;
    route_short_name: string;
    route_long_name: string;
    route_desc: string | null;
    route_type: number;
    route_url: string | null;
    route_color: string;
    route_text_color: string;
    route_sort_order: number | null;
    continuous_pickup: string | null;
    continuous_drop_off: string | null;
    network_id: string | null;
};

export const getRoute = async (route_id: string | number): Promise<RouteData> => {
    const { data } = await axios.get<RouteData>(
        `${import.meta.env.PUBLIC_GTFS_API_URL}/routes/${route_id}`
    );
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

export type ShapeData = {
    shape_id: string;
    shape_pt_sequence: number;
    shape_pt_lat: number;
    shape_pt_lon: number;
    shape_dist_traveled?: number;
};

export const getShapesGeojson = async ({
    shape_id,
    trip_id,
}: { shape_id?: string; trip_id?: string } = {}) => {
    if (!shape_id && !trip_id) return null;

    const { data } = await axios.get<ShapeData[]>(`${import.meta.env.PUBLIC_GTFS_API_URL}/shapes`, {
        params: { shape_id, trip_id },
    });

    const coordinates: [number, number][] = data.map((point) => [
        point.shape_pt_lon,
        point.shape_pt_lat,
    ]);

    return [coordsToGeoJsonLine(coordinates)];
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

export type StopTimeByRouteData = {
    trip_id: string;
    arrival_time: string;
    arrival_timestamp: number;
    departure_time: string;
    departure_timestamp: number;
    stop_id: string;
    stop_sequence: number;
    stop_headsign: string | null;
    pickup_type: number;
    drop_off_type: number;
    continuous_pickup: any;
    continuous_drop_off: any;
    shape_dist_traveled: number;
    timepoint: number;
    trip: {
        trip_id: string;
        route_id: string;
        service_id: string;
        trip_headsign: string;
        trip_short_name: string | null;
        direction_id: number;
        block_id: string;
        shape_id: string;
        wheelchair_accessible: any;
        bikes_allowed: any;
    };
    stop_time_update: {
        trip_id: string | null;
        trip_start_time: string | null;
        direction_id: number | null;
        route_id: string | null;
        stop_id: string | null;
        stop_sequence: number | null;
        arrival_delay: number | null;
        departure_delay: number | null;
        departure_timestamp: string | null;
        arrival_timestamp: string | null;
        schedule_relationship: string | null;
        is_updated: number;
    } | null;
};

export const getStopTimesByRoute = async (routeId: string, stopId?: string | number) => {
    const res: AxiosResponse<StopTimeByRouteData[], unknown> = await axios.get(
        `${import.meta.env.PUBLIC_GTFS_API_URL}/stoptimes/route/${routeId}`,
        { params: { stop_id: stopId } }
    );
    return res.data;
};

type StopTimeByTripData = {
    trip_id: string;
    arrival_time: string;
    arrival_timestamp: number;
    departure_time: string;
    departure_timestamp: number;
    stop_id: string;
    stop_sequence: number;
    stop_headsign: string | null;
    pickup_type: number;
    drop_off_type: number;
    continuous_pickup: any;
    continuous_drop_off: any;
    shape_dist_traveled: number;
    timepoint: number;
    stop: {
        stop_id: string;
        stop_code: string;
        stop_name: string;
        tts_stop_name: string | null;
        stop_desc: string | null;
        stop_lat: number;
        stop_lon: number;
        zone_id: string | null;
        stop_url: string | null;
        location_type: string | null;
        parent_station: string | null;
        stop_timezone: string | null;
        wheelchair_boarding: number;
        level_id: string | null;
        platform_code: string | null;
    };
};

export const getStopTimesByTrip = async (tripId: string) => {
    if (!tripId) return null;

    const res: AxiosResponse<StopTimeByTripData[], unknown> = await axios.get(
        `${import.meta.env.PUBLIC_GTFS_API_URL}/stoptimes/trip/${tripId}`
    );
    return res.data;
};
