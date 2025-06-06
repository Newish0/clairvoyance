// Generated by pydantic-to-ts-converter
// From Pydantic models in Python module: models (path: models)
// Timestamp: 2025-05-31T00:09:21.886683


export type WithObjectId<T> = T & { _id: string };


export enum AlertCause {
  UNKNOWN_CAUSE = 1,
  OTHER_CAUSE = 2,
  TECHNICAL_PROBLEM = 3,
  STRIKE = 4,
  DEMONSTRATION = 5,
  ACCIDENT = 6,
  HOLIDAY = 7,
  WEATHER = 8,
  MAINTENANCE = 9,
  CONSTRUCTION = 10,
  POLICE_ACTIVITY = 11,
  MEDICAL_EMERGENCY = 12,
}

export enum AlertEffect {
  NO_SERVICE = 1,
  REDUCED_SERVICE = 2,
  SIGNIFICANT_DELAYS = 3,
  DETOUR = 4,
  ADDITIONAL_SERVICE = 5,
  MODIFIED_SERVICE = 6,
  OTHER_EFFECT = 7,
  UNKNOWN_EFFECT = 8,
  STOP_MOVED = 9,
  NO_EFFECT = 10,
  ACCESSIBILITY_ISSUE = 11,
}

export enum AlertSeverityLevel {
  UNKNOWN_SEVERITY = 1,
  INFO = 2,
  WARNING = 3,
  SEVERE = 4,
}

export enum AttributionRole {
  NO_ROLE = 0,
  HAS_ROLE = 1,
}

export enum BikesAllowed {
  NO_INFO = 0,
  ALLOWED = 1,
  NOT_ALLOWED = 2,
}

export enum BookingType {
  REAL_TIME = 0,
  SAME_DAY_ADVANCE = 1,
  PRIOR_DAYS_ADVANCE = 2,
}

export enum CalendarAvailability {
  NOT_AVAILABLE = 0,
  AVAILABLE = 1,
}

export enum CalendarExceptionType {
  ADDED = 1,
  REMOVED = 2,
}

export enum CongestionLevel {
  UNKNOWN_CONGESTION_LEVEL = 0,
  RUNNING_SMOOTHLY = 1,
  STOP_AND_GO = 2,
  CONGESTION = 3,
  SEVERE_CONGESTION = 4,
}

export enum ContinuousPickupDropOff {
  CONTINUOUS = 0,
  NONE = 1,
  PHONE_AGENCY = 2,
  COORDINATE_WITH_DRIVER = 3,
}

export enum DirectionId {
  DIRECTION_0 = 0,
  DIRECTION_1 = 1,
}

export enum DynamicStopWheelchairBoarding {
  UNKNOWN = 0,
  AVAILABLE = 1,
  NOT_AVAILABLE = 2,
}

export enum FareMediaType {
  NONE = 0,
  PAPER_TICKET = 1,
  TRANSIT_CARD = 2,
  CEMV = 3,
  MOBILE_APP = 4,
}

export enum FarePaymentMethod {
  ON_BOARD = 0,
  BEFORE_BOARDING = 1,
}

export enum FareTransferCount {
  NO_TRANSFERS = 0,
  ONE_TRANSFER = 1,
  TWO_TRANSFERS = 2,
}

export enum FareTransferDurationLimitType {
  DEPARTURE_TO_ARRIVAL = 0,
  DEPARTURE_TO_DEPARTURE = 1,
  ARRIVAL_TO_DEPARTURE = 2,
  ARRIVAL_TO_ARRIVAL = 3,
}

export enum FareTransferType {
  FROM_LEG_PLUS_TRANSFER_COST = 0,
  FROM_LEG_PLUS_TRANSFER_PLUS_TO_LEG = 1,
  TRANSFER_COST_ONLY = 2,
}

export enum Incrementality {
  FULL_DATASET = 0,
  DIFFERENTIAL = 1,
}

export enum IntEnum {

}

export enum LocationType {
  STOP = 0,
  STATION = 1,
  ENTRANCE_EXIT = 2,
  GENERIC_NODE = 3,
  BOARDING_AREA = 4,
}

export enum OccupancyStatus {
  EMPTY = 0,
  MANY_SEATS_AVAILABLE = 1,
  FEW_SEATS_AVAILABLE = 2,
  STANDING_ROOM_ONLY = 3,
  CRUSHED_STANDING_ROOM_ONLY = 4,
  FULL = 5,
  NOT_ACCEPTING_PASSENGERS = 6,
  NO_DATA_AVAILABLE = 7,
  NOT_BOARDABLE = 8,
}

export enum PathwayBidirectional {
  UNIDIRECTIONAL = 0,
  BIDIRECTIONAL = 1,
}

export enum PathwayMode {
  WALKWAY = 1,
  STAIRS = 2,
  MOVING_SIDEWALK = 3,
  ESCALATOR = 4,
  ELEVATOR = 5,
  FARE_GATE = 6,
  EXIT_GATE = 7,
}

export enum PickupDropOffType {
  REGULARLY_SCHEDULED = 0,
  NO_SERVICE_AVAILABLE = 1,
  PHONE_AGENCY = 2,
  COORDINATE_WITH_DRIVER = 3,
}

export enum RiderCategoryDefault {
  NOT_DEFAULT = 0,
  IS_DEFAULT = 1,
}

export enum RouteType {
  TRAM = 0,
  SUBWAY = 1,
  RAIL = 2,
  BUS = 3,
  FERRY = 4,
  CABLE_TRAM = 5,
  AERIAL_LIFT = 6,
  FUNICULAR = 7,
  TROLLEYBUS = 11,
  MONORAIL = 12,
}

export enum StopTimeUpdateScheduleRelationship {
  SCHEDULED = 0,
  SKIPPED = 1,
  NO_DATA = 2,
  UNSCHEDULED = 3,
}

export enum Timepoint {
  APPROXIMATE = 0,
  EXACT = 1,
}

export enum TripDescriptorScheduleRelationship {
  SCHEDULED = 0,
  ADDED = 1,
  UNSCHEDULED = 2,
  CANCELED = 3,
  DUPLICATED = 4,
  DELETED = 5,
}

export enum TripWheelchairAccessibility {
  NO_INFO = 0,
  ACCESSIBLE = 1,
  NOT_ACCESSIBLE = 2,
}

export enum VehicleStopStatus {
  INCOMING_AT = 0,
  STOPPED_AT = 1,
  IN_TRANSIT_TO = 2,
}

export enum VehicleWheelchairAccessible {
  NO_VALUE = 0,
  UNKNOWN = 1,
  WHEELCHAIR_ACCESSIBLE = 2,
  WHEELCHAIR_INACCESSIBLE = 3,
}

export enum WheelchairBoarding {
  NO_INFO = 0,
  ACCESSIBLE = 1,
  NOT_ACCESSIBLE = 2,
}

export interface Alert {
  _id?: null | string;
  revision_id?: null | string;
  producer_alert_id?: null | string;
  agency_id: string;
  active_periods?: TimeRange[];
  informed_entities?: EntitySelector[];
  cause?: AlertCause;
  effect?: AlertEffect;
  url?: Translation[] | null;
  header_text?: Translation[] | null;
  description_text?: Translation[] | null;
  severity_level?: AlertSeverityLevel | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface Document {
  _id?: null | string;
  revision_id?: null | string;
}

export interface EntitySelector {
  agency_id?: null | string;
  route_id?: null | string;
  route_type?: null | number;
  trip?: TripDescriptor | null;
  stop_id?: null | string;
  direction_id?: null | number;
}

export interface LineStringGeometry {
  type?: string;
  coordinates: number[][];
}

export interface PointGeometry {
  type?: string;
  coordinates: number[];
}

export interface Position {
  latitude: number;
  longitude: number;
  timestamp: Date;
  bearing?: null | number;
  speed?: null | number;
}

export interface Route {
  _id?: null | string;
  revision_id?: null | string;
  route_id: string;
  agency_id?: null | string;
  route_short_name?: null | string;
  route_long_name?: null | string;
  route_desc?: null | string;
  route_type: RouteType;
  route_url?: null | string;
  route_color?: null | string;
  route_text_color?: null | string;
  route_sort_order?: null | number;
  continuous_pickup?: ContinuousPickupDropOff | null;
  continuous_drop_off?: ContinuousPickupDropOff | null;
}

export interface ScheduledTripDocument {
  _id?: null | string;
  revision_id?: null | string;
  trip_id: string;
  start_date: string;
  start_time: string;
  route_id: string;
  service_id: string;
  route_short_name?: null | string;
  agency_timezone_str?: string;
  direction_id?: null | number;
  shape_id?: null | string;
  trip_headsign?: null | string;
  trip_short_name?: null | string;
  block_id?: null | string;
  stop_times?: StopTimeInfo[];
  current_stop_sequence?: null | number;
  current_status?: VehicleStopStatus | null;
  schedule_relationship?: TripDescriptorScheduleRelationship;
  vehicle?: Vehicle | null;
  current_occupancy?: OccupancyStatus | null;
  current_congestion?: CongestionLevel | null;
  current_position?: Position | null;
  history?: TripVehicleHistory[];
  stop_times_updated_at?: Date | null;
  position_updated_at?: Date | null;
  start_datetime: Date;
}

export interface Shape {
  _id?: null | string;
  revision_id?: null | string;
  shape_id: string;
  geometry: LineStringGeometry;
  distances_traveled?: null | null | number[];
}

export interface Stop {
  _id?: null | string;
  revision_id?: null | string;
  stop_id: string;
  stop_code?: null | string;
  stop_name?: null | string;
  stop_desc?: null | string;
  location?: PointGeometry | null;
  zone_id?: null | string;
  stop_url?: null | string;
  location_type?: LocationType | null;
  parent_station_id?: null | string;
  stop_timezone?: null | string;
  wheelchair_boarding?: WheelchairBoarding | null;
  level_id?: null | string;
  platform_code?: null | string;
}

export interface StopTimeInfo {
  stop_id: string;
  stop_sequence: number;
  stop_headsign?: null | string;
  pickup_type?: null | number;
  drop_off_type?: null | number;
  shape_dist_traveled?: null | number;
  arrival_datetime: Date;
  departure_datetime: Date;
  schedule_relationship?: StopTimeUpdateScheduleRelationship | null;
  predicted_arrival_datetime?: Date | null;
  predicted_departure_datetime?: Date | null;
  predicted_arrival_uncertainty?: null | number;
  predicted_departure_uncertainty?: null | number;
  arrival_delay?: null | number;
  departure_delay?: null | number;
}

export interface TimeRange {
  start?: Date | null;
  end?: Date | null;
}

export interface Translation {
  text: string;
  language: string;
}

export interface TripDescriptor {
  trip_id?: null | string;
  start_time?: null | string;
  start_date?: null | string;
  route_id?: null | string;
  direction_id?: null | number;
}

export interface TripVehicleHistory {
  timestamp: Date;
  position: Position;
  congestion_level: CongestionLevel | null;
  occupancy_status: OccupancyStatus | null;
}

export interface Vehicle {
  vehicle_id?: null | string;
  label?: null | string;
  license_plate?: null | string;
  wheelchair_accessible?: VehicleWheelchairAccessible | null;
}