import { schema } from "./schema";

export const routeTypeEnum = schema.enum("route_type", [
    "TRAM",
    "SUBWAY",
    "RAIL",
    "BUS",
    "FERRY",
    "CABLE_TRAM",
    "AERIAL_LIFT",
    "FUNICULAR",
    "TROLLEYBUS",
    "MONORAIL",
]);

export const locationTypeEnum = schema.enum("location_type", [
    "STOP_OR_PLATFORM",
    "STATION",
    "ENTRANCE_EXIT",
    "GENERIC_NODE",
    "BOARDING_AREA",
]);

/**
 * Is "NO PICKUP" for pickup type and "NO DROP OFF" for drop off type
 */
export const pickupDropOffEnum = schema.enum("pickup_drop_off", [
    "REGULAR",
    "NO_PICKUP_OR_DROP_OFF",
    "PHONE_AGENCY",
    "COORDINATE_WITH_DRIVER",
]);

export const directionEnum = schema.enum("direction", ["OUTBOUND", "INBOUND"]);

export const wheelchairBoardingEnum = schema.enum("wheelchair_boarding", [
    "NO_INFO",
    "ACCESSIBLE",
    "NOT_ACCESSIBLE",
]);

export const calendarExceptionTypeEnum = schema.enum("calendar_exception_type", [
    "ADDED",
    "REMOVED",
]);

export const timepointEnum = schema.enum("timepoint", ["APPROXIMATE", "EXACT"]);

export const stopTimeUpdateScheduleRelationshipEnum = schema.enum(
    "stop_time_update_schedule_relationship",
    ["SCHEDULED", "SKIPPED", "NO_DATA", "UNSCHEDULED"],
);

export const vehicleStopStatusEnum = schema.enum("vehicle_stop_status", [
    "INCOMING_AT",
    "STOPPED_AT",
    "IN_TRANSIT_TO",
]);

export const congestionLevelEnum = schema.enum("congestion_level", [
    "UNKNOWN_CONGESTION_LEVEL",
    "RUNNING_SMOOTHLY",
    "STOP_AND_GO",
    "CONGESTION",
    "SEVERE_CONGESTION",
]);

export const occupancyStatusEnum = schema.enum("occupancy_status", [
    "EMPTY",
    "MANY_SEATS_AVAILABLE",
    "FEW_SEATS_AVAILABLE",
    "STANDING_ROOM_ONLY",
    "CRUSHED_STANDING_ROOM_ONLY",
    "FULL",
    "NOT_ACCEPTING_PASSENGERS",
    "NO_DATA_AVAILABLE",
    "NOT_BOARDABLE",
]);

export const alertCauseEnum = schema.enum("alert_cause", [
    "UNKNOWN_CAUSE",
    "OTHER_CAUSE",
    "TECHNICAL_PROBLEM",
    "STRIKE",
    "DEMONSTRATION",
    "ACCIDENT",
    "HOLIDAY",
    "WEATHER",
    "MAINTENANCE",
    "CONSTRUCTION",
    "POLICE_ACTIVITY",
    "MEDICAL_EMERGENCY",
]);

export const alertEffectEnum = schema.enum("alert_effect", [
    "NO_SERVICE",
    "REDUCED_SERVICE",
    "SIGNIFICANT_DELAYS",
    "DETOUR",
    "ADDITIONAL_SERVICE",
    "MODIFIED_SERVICE",
    "OTHER_EFFECT",
    "UNKNOWN_EFFECT",
    "STOP_MOVED",
    "NO_EFFECT",
    "ACCESSIBILITY_ISSUE",
]);

export const alertSeverityEnum = schema.enum("alert_severity", [
    "UNKNOWN_SEVERITY",
    "INFO",
    "WARNING",
    "SEVERE",
]);

/**
 * TripInstanceState:
 * PRISTINE: Freshly created from schedule
 * DIRTY: Modified by realtime updates
 * REMOVED: Was scheduled but now removed
 */
export const tripInstanceStateEnum = schema.enum("trip_instance_state", [
    "PRISTINE",
    "DIRTY",
    "REMOVED",
]);

export const alertStatusEnum = schema.enum("alert_status", ["ACTIVE", "UPCOMING", "INACTIVE"]);

// =========================================================
// TYPES (string literal unions inferred from enum values)
// =========================================================

export type RouteType = (typeof routeTypeEnum.enumValues)[number];
export type LocationType = (typeof locationTypeEnum.enumValues)[number];
export type PickupDropOff = (typeof pickupDropOffEnum.enumValues)[number];
export type Direction = (typeof directionEnum.enumValues)[number];
export type WheelchairBoarding = (typeof wheelchairBoardingEnum.enumValues)[number];
export type CalendarExceptionType = (typeof calendarExceptionTypeEnum.enumValues)[number];
export type Timepoint = (typeof timepointEnum.enumValues)[number];
export type StopTimeUpdateScheduleRelationship =
    (typeof stopTimeUpdateScheduleRelationshipEnum.enumValues)[number];
export type VehicleStopStatus = (typeof vehicleStopStatusEnum.enumValues)[number];
export type CongestionLevel = (typeof congestionLevelEnum.enumValues)[number];
export type OccupancyStatus = (typeof occupancyStatusEnum.enumValues)[number];
export type AlertCause = (typeof alertCauseEnum.enumValues)[number];
export type AlertEffect = (typeof alertEffectEnum.enumValues)[number];
export type AlertSeverity = (typeof alertSeverityEnum.enumValues)[number];
export type TripInstanceState = (typeof tripInstanceStateEnum.enumValues)[number];
export type AlertStatus = (typeof alertStatusEnum.enumValues)[number];
