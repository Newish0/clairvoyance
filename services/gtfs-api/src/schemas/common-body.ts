/**
 * This file contains common response body shared across all endpoints
 */

import { t } from "elysia";

// --- Enum Definitions ---

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

export enum CongestionLevel {
    UNKNOWN_CONGESTION_LEVEL = 0,
    RUNNING_SMOOTHLY = 1,
    STOP_AND_GO = 2,
    CONGESTION = 3,
    SEVERE_CONGESTION = 4,
}

export enum DirectionId {
    DIRECTION_0 = 0,
    DIRECTION_1 = 1,
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

// Although PickupDropOffType is typed as `number` in StopTimeInfo,
// we define the enum and its schema as requested.
export enum PickupDropOffType {
    REGULARLY_SCHEDULED = 0,
    NO_SERVICE_AVAILABLE = 1,
    PHONE_AGENCY = 2,
    COORDINATE_WITH_DRIVER = 3,
}

export enum StopTimeUpdateScheduleRelationship {
    SCHEDULED = 0,
    SKIPPED = 1,
    NO_DATA = 2,
    UNSCHEDULED = 3,
}

export enum TripDescriptorScheduleRelationship {
    SCHEDULED = 0,
    ADDED = 1,
    UNSCHEDULED = 2,
    CANCELED = 3,
    DUPLICATED = 4,
    DELETED = 5,
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

// --- Enum Schemas ---

export const AlertCauseSchema = t.Enum(AlertCause);
export const AlertEffectSchema = t.Enum(AlertEffect);
export const AlertSeverityLevelSchema = t.Enum(AlertSeverityLevel);
export const CongestionLevelSchema = t.Enum(CongestionLevel);
export const DirectionIdSchema = t.Enum(DirectionId); // Schema for the enum
export const OccupancyStatusSchema = t.Enum(OccupancyStatus);
export const PickupDropOffTypeSchema = t.Enum(PickupDropOffType); // Schema for the enum
export const StopTimeUpdateScheduleRelationshipSchema = t.Enum(StopTimeUpdateScheduleRelationship);
export const TripDescriptorScheduleRelationshipSchema = t.Enum(TripDescriptorScheduleRelationship);
export const VehicleStopStatusSchema = t.Enum(VehicleStopStatus);
export const VehicleWheelchairAccessibleSchema = t.Enum(VehicleWheelchairAccessible);

// --- Child Object Schemas ---

export const TimeRangeSchema = t.Object({
    start: t.Optional(t.Nullable(t.Date())),
    end: t.Optional(t.Nullable(t.Date())),
});

export const TranslationSchema = t.Object({
    text: t.String(),
    language: t.String(),
});

export const TripDescriptorSchema = t.Object({
    trip_id: t.Optional(t.Nullable(t.String())),
    start_time: t.Optional(t.Nullable(t.String())), // As per type: string
    start_date: t.Optional(t.Nullable(t.String())), // As per type: string
    route_id: t.Optional(t.Nullable(t.String())),
    direction_id: t.Optional(t.Nullable(t.Number())), // As per type: null | number
});

export const EntitySelectorSchema = t.Object({
    agency_id: t.Optional(t.Nullable(t.String())),
    route_id: t.Optional(t.Nullable(t.String())),
    route_type: t.Optional(t.Nullable(t.Number())), // As per type: null | number
    trip: t.Optional(t.Nullable(TripDescriptorSchema)),
    stop_id: t.Optional(t.Nullable(t.String())),
    direction_id: t.Optional(t.Nullable(t.Number())), // As per type: null | number
});

export const PositionSchema = t.Object({
    latitude: t.Number(),
    longitude: t.Number(),
    timestamp: t.Date(),
    bearing: t.Optional(t.Nullable(t.Number())),
    speed: t.Optional(t.Nullable(t.Number())),
});

export const VehicleSchema = t.Object({
    vehicle_id: t.Optional(t.Nullable(t.String())),
    label: t.Optional(t.Nullable(t.String())),
    license_plate: t.Optional(t.Nullable(t.String())),
    wheelchair_accessible: t.Optional(t.Nullable(VehicleWheelchairAccessibleSchema)),
});

export const StopTimeInfoSchema = t.Object({
    stop_id: t.String(),
    stop_sequence: t.Number(),
    stop_headsign: t.Optional(t.Nullable(t.String())),
    pickup_type: t.Optional(t.Nullable(t.Number())), // As per type: null | number
    drop_off_type: t.Optional(t.Nullable(t.Number())), // As per type: null | number
    shape_dist_traveled: t.Optional(t.Nullable(t.Number())),
    arrival_datetime: t.Date(),
    departure_datetime: t.Date(),
    schedule_relationship: t.Optional(t.Nullable(StopTimeUpdateScheduleRelationshipSchema)),
    predicted_arrival_datetime: t.Optional(t.Nullable(t.Date())),
    predicted_departure_datetime: t.Optional(t.Nullable(t.Date())),
    predicted_arrival_uncertainty: t.Optional(t.Nullable(t.Number())),
    predicted_departure_uncertainty: t.Optional(t.Nullable(t.Number())),
    arrival_delay: t.Optional(t.Nullable(t.Number())),
    departure_delay: t.Optional(t.Nullable(t.Number())),
});

export const StopTimeInfoWithStopNameSchema = t.Intersect([
    StopTimeInfoSchema,
    t.Object({
        stop_name: t.Nullable(t.String()),
    }),
]);

export const TripVehicleHistorySchema = t.Object({
    timestamp: t.Date(),
    position: PositionSchema,
    congestion_level: t.Nullable(CongestionLevelSchema),
    occupancy_status: t.Nullable(OccupancyStatusSchema),
});

// --- Main Schemas ---

export const AlertSchema = t.Object({
    _id: t.Optional(t.Nullable(t.Any())),
    producer_alert_id: t.Optional(t.Nullable(t.String())),
    agency_id: t.String(),
    active_periods: t.Optional(t.Array(TimeRangeSchema)),
    informed_entities: t.Optional(t.Array(EntitySelectorSchema)),
    cause: t.Optional(AlertCauseSchema),
    effect: t.Optional(AlertEffectSchema),
    url: t.Optional(t.Nullable(t.Array(TranslationSchema))),
    header_text: t.Optional(t.Nullable(t.Array(TranslationSchema))),
    description_text: t.Optional(t.Nullable(t.Array(TranslationSchema))),
    severity_level: t.Optional(t.Nullable(AlertSeverityLevelSchema)),
    created_at: t.Optional(t.Date()),
    updated_at: t.Optional(t.Date()),
});

export const ScheduledTripDocumentSchema = t.Object({
    _id: t.Optional(t.Nullable(t.Any())),
    trip_id: t.String(),
    start_date: t.String(), // As per type: string
    start_time: t.String(), // As per type: string
    route_id: t.String(),
    service_id: t.String(),
    route_short_name: t.Optional(t.Nullable(t.String())),
    agency_timezone_str: t.Optional(t.String()),
    direction_id: t.Optional(t.Nullable(t.Number())), // As per type: null | number
    shape_id: t.Optional(t.Nullable(t.String())),
    trip_headsign: t.Optional(t.Nullable(t.String())),
    trip_short_name: t.Optional(t.Nullable(t.String())),
    block_id: t.Optional(t.Nullable(t.String())),
    stop_times: t.Optional(t.Array(StopTimeInfoSchema)),
    current_stop_sequence: t.Optional(t.Nullable(t.Number())),
    current_status: t.Optional(t.Nullable(VehicleStopStatusSchema)),
    schedule_relationship: t.Optional(TripDescriptorScheduleRelationshipSchema),
    vehicle: t.Optional(t.Nullable(VehicleSchema)),
    current_occupancy: t.Optional(t.Nullable(OccupancyStatusSchema)),
    current_congestion: t.Optional(t.Nullable(CongestionLevelSchema)),
    current_position: t.Optional(t.Nullable(PositionSchema)),
    history: t.Optional(t.Array(TripVehicleHistorySchema)),
    stop_times_updated_at: t.Optional(t.Nullable(t.Date())),
    position_updated_at: t.Optional(t.Nullable(t.Date())),
    start_datetime: t.Date(),
});

export const ScheduledTripDocumentWithStopNamesSchema = t.Intersect([
    t.Omit(ScheduledTripDocumentSchema, ["stop_times"]),
    t.Object({
        stop_times: t.Optional(t.Array(StopTimeInfoWithStopNameSchema)),
    }),
]);
