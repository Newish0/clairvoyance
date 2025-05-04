// export interface TripInfo {
//     id: string;
//     service_id: string;
//     trip_headsign: string;
//     trip_short_name: string;
//     direction_id: number;
//     shape_id?: string;
// }

// export interface RouteInfo {
//     id: string;
//     short_name: string;
//     long_name: string;
//     type: number;
// }

// export interface StopInfo {
//     id: string;
//     name: string;
//     lat: number;
//     lon: number;
//     distance: number;
// }

// export interface StopTimeInfo {
//     trip_id: string;
//     arrival_time: string;
//     departure_time: string;
//     continuous_pickup: number;
//     continuous_drop_off: number;
//     is_last: boolean;
//     arrival_delay: number | null;
//     departure_delay: number | null;
// }


// export interface NearbyResponse {
//     route: RouteInfo;
//     trip: TripInfo;
//     stop: StopInfo;
//     stop_time: StopTimeInfo;
//     vehicle_position: VehiclePositionResponse | null;
// }

// // Interface for individual shape points
// export interface ShapePoint {
//     lat: number;
//     lon: number;
//     sequence: number;
//     dist_traveled?: number;
// }

// // Interface for the trip shape response
// export interface TripShapeResponse {
//     trip_id: string;
//     shape_points: ShapePoint[];
// }

// export interface TripStopResponse {
//     // StopTime fields
//     stop_time_id: number;
//     trip_id: string;
//     arrival_time: string;
//     departure_time: string;
//     stop_sequence: number;
//     stop_headsign?: string;
//     pickup_type?: number;
//     drop_off_type?: number;
//     shape_dist_traveled?: number;
//     timepoint?: number;
//     continuous_pickup?: number;
//     continuous_drop_off?: number;

//     // Stop fields
//     stop_id: string;
//     stop_name: string;
//     stop_lat: number;
//     stop_lon: number;
//     stop_code?: string;
//     stop_desc?: string;
//     zone_id?: string;
//     stop_url?: string;
//     location_type?: number;
//     parent_station?: string | null;
//     stop_timezone?: string;
//     wheelchair_boarding?: number;
//     level_id?: string;
//     platform_code?: string;
// }

// export type OccupancyStatus = 
//   | 'EMPTY'
//   | 'MANY_SEATS_AVAILABLE'
//   | 'FEW_SEATS_AVAILABLE'
//   | 'STANDING_ROOM_ONLY'
//   | 'CRUSHED_STANDING_ROOM_ONLY'
//   | 'FULL'
//   | 'NOT_ACCEPTING_PASSENGERS'
//   | 'NO_DATA_AVAILABLE'
//   | 'NOT_BOARDABLE';


// export interface VehiclePositionResponse {
//     vehicle_id: string;
//     trip_id?: string;
//     route_id: string;
//     latitude: number;
//     longitude: number;
//     current_stop_id?: string;
//     current_status?: string;
//     timestamp: string;
//     bearing?: number;
//     speed?: number;
//     congestion_level?: string;
//     occupancy_status?: OccupancyStatus;
//     current_stop_sequence?: number;
// }

// export interface TripDetailsResponse {
//     id: string;
//     route_id: string;
//     service_id: string;
//     headsign: string;
//     short_name: string;
//     direction_id?: number;
//     block_id?: string;
//     shape_id?: string;
//     wheelchair_accessible?: number;
//     bikes_allowed?: number;
//     current_status?: string;
//     current_delay?: number;
//     last_updated?: string;
// }

// export interface RouteDetailsResponse {
//     id: string;
//     agency_id: string;
//     short_name: string;
//     long_name: string;
//     description?: string;
//     route_type: number;
//     url?: string;
//     color?: string;
//     text_color?: string;
//     sort_order?: number;
//     continuous_pickup?: number;
//     continuous_drop_off?: number;
// }


// export interface RouteStopTimeResponse {
//     trip_id: string;
//     arrival_time: string;
//     departure_time: string;
//     trip_headsign: string;
//     realtime_arrival_delay?: number;
//     realtime_departure_delay?: number;
//     realtime_timestamp?: string;
// }
