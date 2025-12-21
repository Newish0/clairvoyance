import {
    boolean,
    doublePrecision,
    foreignKey,
    geometry,
    index,
    integer,
    jsonb,
    pgEnum,
    pgMaterializedView,
    pgTable,
    primaryKey,
    serial,
    text,
    timestamp,
    unique,
    varchar,
    type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// =========================================================
// ENUMS
// =========================================================

/** Utility function to convert TS enum to pgEnum format */
function enumToPgEnum<T extends Record<string, any>>(myEnum: T): [T[keyof T], ...T[keyof T][]] {
    return Object.values(myEnum).map((value: any) => `${value}`) as any;
}

// TypeScript Enums
export enum RouteType {
    TRAM = "TRAM",
    SUBWAY = "SUBWAY",
    RAIL = "RAIL",
    BUS = "BUS",
    FERRY = "FERRY",
    CABLE_TRAM = "CABLE_TRAM",
    AERIAL_LIFT = "AERIAL_LIFT",
    FUNICULAR = "FUNICULAR",
    TROLLEYBUS = "TROLLEYBUS",
    MONORAIL = "MONORAIL",
}

export enum LocationType {
    STOP_OR_PLATFORM = "STOP_OR_PLATFORM",
    STATION = "STATION",
    ENTRANCE_EXIT = "ENTRANCE_EXIT",
    GENERIC_NODE = "GENERIC_NODE",
    BOARDING_AREA = "BOARDING_AREA",
}

export enum PickupDropOff {
    REGULAR = "REGULAR",
    NO_PICKUP_OR_DROP_OFF = "NO_PICKUP_OR_DROP_OFF",
    PHONE_AGENCY = "PHONE_AGENCY",
    COORDINATE_WITH_DRIVER = "COORDINATE_WITH_DRIVER",
}

export enum Direction {
    OUTBOUND = "OUTBOUND",
    INBOUND = "INBOUND",
}

export enum WheelchairBoarding {
    NO_INFO = "NO_INFO",
    ACCESSIBLE = "ACCESSIBLE",
    NOT_ACCESSIBLE = "NOT_ACCESSIBLE",
}

export enum CalendarExceptionType {
    ADDED = "ADDED",
    REMOVED = "REMOVED",
}

export enum Timepoint {
    APPROXIMATE = "APPROXIMATE",
    EXACT = "EXACT",
}

export enum StopTimeUpdateScheduleRelationship {
    SCHEDULED = "SCHEDULED",
    SKIPPED = "SKIPPED",
    NO_DATA = "NO_DATA",
    UNSCHEDULED = "UNSCHEDULED",
}

export enum VehicleStopStatus {
    INCOMING_AT = "INCOMING_AT",
    STOPPED_AT = "STOPPED_AT",
    IN_TRANSIT_TO = "IN_TRANSIT_TO",
}

export enum CongestionLevel {
    UNKNOWN_CONGESTION_LEVEL = "UNKNOWN_CONGESTION_LEVEL",
    RUNNING_SMOOTHLY = "RUNNING_SMOOTHLY",
    STOP_AND_GO = "STOP_AND_GO",
    CONGESTION = "CONGESTION",
    SEVERE_CONGESTION = "SEVERE_CONGESTION",
}

export enum OccupancyStatus {
    EMPTY = "EMPTY",
    MANY_SEATS_AVAILABLE = "MANY_SEATS_AVAILABLE",
    FEW_SEATS_AVAILABLE = "FEW_SEATS_AVAILABLE",
    STANDING_ROOM_ONLY = "STANDING_ROOM_ONLY",
    CRUSHED_STANDING_ROOM_ONLY = "CRUSHED_STANDING_ROOM_ONLY",
    FULL = "FULL",
    NOT_ACCEPTING_PASSENGERS = "NOT_ACCEPTING_PASSENGERS",
    NO_DATA_AVAILABLE = "NO_DATA_AVAILABLE",
    NOT_BOARDABLE = "NOT_BOARDABLE",
}

export enum AlertCause {
    UNKNOWN_CAUSE = "UNKNOWN_CAUSE",
    OTHER_CAUSE = "OTHER_CAUSE",
    TECHNICAL_PROBLEM = "TECHNICAL_PROBLEM",
    STRIKE = "STRIKE",
    DEMONSTRATION = "DEMONSTRATION",
    ACCIDENT = "ACCIDENT",
    HOLIDAY = "HOLIDAY",
    WEATHER = "WEATHER",
    MAINTENANCE = "MAINTENANCE",
    CONSTRUCTION = "CONSTRUCTION",
    POLICE_ACTIVITY = "POLICE_ACTIVITY",
    MEDICAL_EMERGENCY = "MEDICAL_EMERGENCY",
}

export enum AlertEffect {
    NO_SERVICE = "NO_SERVICE",
    REDUCED_SERVICE = "REDUCED_SERVICE",
    SIGNIFICANT_DELAYS = "SIGNIFICANT_DELAYS",
    DETOUR = "DETOUR",
    ADDITIONAL_SERVICE = "ADDITIONAL_SERVICE",
    MODIFIED_SERVICE = "MODIFIED_SERVICE",
    OTHER_EFFECT = "OTHER_EFFECT",
    UNKNOWN_EFFECT = "UNKNOWN_EFFECT",
    STOP_MOVED = "STOP_MOVED",
    NO_EFFECT = "NO_EFFECT",
    ACCESSIBILITY_ISSUE = "ACCESSIBILITY_ISSUE",
}

export enum AlertSeverity {
    UNKNOWN_SEVERITY = "UNKNOWN_SEVERITY",
    INFO = "INFO",
    WARNING = "WARNING",
    SEVERE = "SEVERE",
}

/**
 * TripInstanceState:
 * PRISTINE: Freshly created from schedule
 * DIRTY: Modified by realtime updates
 * REMOVED: Was scheduled but now removed
 */
export enum TripInstanceState {
    PRISTINE = "PRISTINE",
    DIRTY = "DIRTY",
    REMOVED = "REMOVED",
}

// =========================================================
// PG ENUMS
// =========================================================

export const routeTypeEnum = pgEnum("route_type", enumToPgEnum(RouteType));

export const locationTypeEnum = pgEnum("location_type", enumToPgEnum(LocationType));

/**
 * Is "NO PICKUP" for pickup type and "NO DROP OFF" for drop off type
 */
export const pickupDropOffEnum = pgEnum("pickup_drop_off", enumToPgEnum(PickupDropOff));

export const directionEnum = pgEnum("direction", enumToPgEnum(Direction));

export const wheelchairBoardingEnum = pgEnum(
    "wheelchair_boarding",
    enumToPgEnum(WheelchairBoarding)
);

export const calendarExceptionTypeEnum = pgEnum(
    "calendar_exception_type",
    enumToPgEnum(CalendarExceptionType)
);

export const timepointEnum = pgEnum("timepoint", enumToPgEnum(Timepoint));

export const stopTimeUpdateScheduleRelationshipEnum = pgEnum(
    "stop_time_update_schedule_relationship",
    enumToPgEnum(StopTimeUpdateScheduleRelationship)
);

export const vehicleStopStatusEnum = pgEnum("vehicle_stop_status", enumToPgEnum(VehicleStopStatus));

export const congestionLevelEnum = pgEnum("congestion_level", enumToPgEnum(CongestionLevel));

export const occupancyStatusEnum = pgEnum("occupancy_status", enumToPgEnum(OccupancyStatus));

export const alertCauseEnum = pgEnum("alert_cause", enumToPgEnum(AlertCause));

export const alertEffectEnum = pgEnum("alert_effect", enumToPgEnum(AlertEffect));

export const alertSeverityEnum = pgEnum("alert_severity", enumToPgEnum(AlertSeverity));

export const tripInstanceStateEnum = pgEnum("trip_instance_state", enumToPgEnum(TripInstanceState));

// =========================================================
// TYPES
// =========================================================

export type TranslationMap = {
    default: string; // The base/original text provided by the agency
    [languageCode: string]: string;
};

export type TimePeriod = { start?: string; end?: string };

export type EntitySelector = {
    agencyId?: string;
    routeId?: number;
    routeType?: RouteType;
    direction?: Direction;
    tripInstance?: string;
    stopId?: string;
};

// =========================================================
// TABLES
// =========================================================

export const agencies = pgTable("agencies", {
    id: text("id").primaryKey(),
    agencySid: text("agency_sid").notNull(),

    name: text("name").notNull(),
    url: text("url").notNull(),
    timezone: text("timezone").notNull(),
    lang: varchar("lang", { length: 10 }),
    phone: text("phone"),
    fareUrl: text("fare_url"),
    email: text("email"),
});

export const routes = pgTable(
    "routes",
    {
        id: serial("id").primaryKey(),
        agencyId: text("agency_id")
            .notNull()
            .references(() => agencies.id),
        routeSid: text("route_sid").notNull(),

        shortName: text("short_name"),
        longName: text("long_name"),
        type: routeTypeEnum("type").notNull(),
        color: varchar("color", { length: 6 }),
        textColor: varchar("text_color", { length: 6 }),
    },
    (t) => [unique("uq_routes_agency_route_sid").on(t.agencyId, t.routeSid)]
);

export const shapes = pgTable(
    "shapes",
    {
        id: serial("id").primaryKey(),
        agencyId: text("agency_id")
            .notNull()
            .references(() => agencies.id),
        shapeSid: text("shape_sid").notNull(),

        path: geometry("path", { type: "linestring", srid: 4326 }).notNull(),
        distancesTraveled: jsonb("distances_traveled").$type<number[]>(),
    },
    (t) => [
        index("idx_shapes_path_gist").using("gist", t.path),
        index("idx_shapes_shape_sid").on(t.shapeSid),
    ]
);

export const vehicles = pgTable(
    "vehicles",
    {
        id: serial("id").primaryKey(),
        agencyId: text("agency_id")
            .references(() => agencies.id)
            .notNull(),
        vehicleSid: text("vehicle_sid").notNull(),

        label: text("label"),
        licensePlate: text("license_plate"),
        wheelchairAccessible: wheelchairBoardingEnum("wheelchair_accessible"),
    },
    (t) => [unique("uq_vehicles_agency_vehicle_sid").on(t.agencyId, t.vehicleSid)]
);

export const trips = pgTable(
    "trips",
    {
        id: serial("id").primaryKey(),
        agencyId: text("agency_id").references(() => agencies.id),
        routeId: integer("route_id").references(() => routes.id),
        shapeId: integer("shape_id").references(() => shapes.id),
        tripSid: text("trip_sid").notNull(),
        serviceSid: text("service_sid").notNull(),

        headsign: text("headsign"),
        shortName: text("short_name"),
        direction: directionEnum("direction"),
        blockId: text("block_id"),
    },
    (t) => [unique("uq_trips_agency_trip_sid").on(t.agencyId, t.tripSid)]
);

export const stops = pgTable(
    "stops",
    {
        id: serial("id").primaryKey(),
        agencyId: text("agency_id").references(() => agencies.id),
        stopSid: text("stop_sid").notNull(),

        code: text("code"),
        name: text("name"),
        description: text("description"),
        location: geometry("location", { type: "point", srid: 4326 }),
        zoneId: text("zone_id"),
        url: text("url"),
        locationType: locationTypeEnum("location_type"),

        // Self-reference using explicit type to avoid circular inference issues
        parentStationId: integer("parent_station_id").references((): AnyPgColumn => stops.id),

        timezone: text("timezone"),
        wheelchairBoarding: wheelchairBoardingEnum("wheelchair_boarding"),
    },
    (t) => [
        index("idx_stops_location_gist").using("gist", t.location),
        index("idx_stops_agency_stop_sid").on(t.agencyId, t.stopSid),
    ]
);

export const calendarDates = pgTable(
    "calendar_dates",
    {
        agencyId: text("agency_id")
            .references(() => agencies.id)
            .notNull(),
        serviceSid: text("service_sid").notNull(),
        date: varchar("date", { length: 8 }).notNull(),
        exceptionType: calendarExceptionTypeEnum("exception_type").notNull(),
    },
    (t) => [primaryKey({ columns: [t.agencyId, t.serviceSid, t.date] })]
);

export const stopTimes = pgTable(
    "stop_times",
    {
        id: serial("id").primaryKey(),

        agencyId: text("agency_id").references(() => agencies.id),
        tripId: integer("trip_id").references(() => trips.id),
        stopId: integer("stop_id").references(() => stops.id),
        tripSid: text("trip_sid").notNull(),
        stopSid: text("stop_sid").notNull(),

        stopSequence: integer("stop_sequence").notNull(),

        // TZ specified by agency.timezone per GTFS spec
        arrivalTime: timestamp("arrival_time", { withTimezone: true }),
        departureTime: timestamp("departure_time", { withTimezone: true }),

        stopHeadsign: text("stop_headsign"),
        pickupType: pickupDropOffEnum("pickup_type"),
        dropOffType: pickupDropOffEnum("drop_off_type"),
        timepoint: timepointEnum("timepoint").default(Timepoint.EXACT),
        shapeDistTraveled: doublePrecision("shape_dist_traveled"),
    },
    (t) => [unique("uq_stop_times_agency_trip_sequence").on(t.agencyId, t.tripSid, t.stopSequence)]
);

export const tripInstances = pgTable(
    "trip_instances",
    {
        id: serial("id").primaryKey(),
        agencyId: text("agency_id")
            .references(() => agencies.id)
            .notNull(),
        tripId: integer("trip_id")
            .references(() => trips.id)
            .notNull(),
        routeId: integer("route_id")
            .references(() => routes.id)
            .notNull(),
        shapeId: integer("shape_id").references(() => shapes.id),
        vehicleId: integer("vehicle_id").references(() => vehicles.id),

        startDate: varchar("start_date", { length: 8 }).notNull(),
        startTime: varchar("start_time", { length: 8 }).notNull(),
        startDatetime: timestamp("start_datetime", { withTimezone: true }).notNull(),

        state: tripInstanceStateEnum("state").notNull().default(TripInstanceState.PRISTINE),

        /** The last time this row was updated a matching realtime trip update */
        lastTripUpdateAt: timestamp("last_trip_update_at", {
            withTimezone: true,
        }),
    },
    (t) => [unique("uq_trip_instances_agency_trip_date").on(t.agencyId, t.tripId, t.startDate)]
);

export const stopTimeInstances = pgTable(
    "stop_time_instances",
    {
        id: serial("id").primaryKey(),
        tripInstanceId: integer("trip_instance_id")
            .references(() => tripInstances.id)
            .notNull(),
        stopTimeId: integer("stop_time_id")
            .references(() => stopTimes.id)
            .notNull(),

        predictedArrivalTime: timestamp("predicted_arrival_time", { withTimezone: true }),
        predictedDepartureTime: timestamp("predicted_departure_time", { withTimezone: true }),
        predictedArrivalUncertainty: integer("predicted_arrival_uncertainty"),
        predictedDepartureUncertainty: integer("predicted_departure_uncertainty"),

        scheduleRelationship: stopTimeUpdateScheduleRelationshipEnum(
            "schedule_relationship"
        ).default(StopTimeUpdateScheduleRelationship.SCHEDULED),
    },
    (t) => [index("idx_stop_time_instances_trip_instance_id").on(t.tripInstanceId)]
);

export const vehiclePositions = pgTable(
    "vehicle_positions",
    {
        id: serial("id").primaryKey(),
        vehicleId: integer("vehicle_id")
            .references(() => vehicles.id)
            .notNull(),
        tripInstanceId: integer("trip_instance_id").references(() => tripInstances.id),

        timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
        location: geometry("location", { type: "point", srid: 4326 }).notNull(),

        stopId: integer("stop_id").references(() => stops.id),
        currentStopSequence: integer("current_stop_sequence"),
        currentStatus: vehicleStopStatusEnum("current_status"),
        congestionLevel: congestionLevelEnum("congestion_level"),
        occupancyStatus: occupancyStatusEnum("occupancy_status"),
        occupancyPercentage: integer("occupancy_percentage"),

        bearing: doublePrecision("bearing"),
        odometer: doublePrecision("odometer"),
        speed: doublePrecision("speed"),

        ingestedAt: timestamp("ingested_at", { withTimezone: true }).defaultNow(),
    },
    (t) => [
        unique("uq_vehicle_positions_vehicle_timestamp").on(t.vehicleId, t.timestamp),
        index("idx_vehicle_positions_location_gist").using("gist", t.location),
    ]
);

export const alerts = pgTable(
    "alerts",
    {
        id: serial("id").primaryKey(),
        agencyId: text("agency_id")
            .references(() => agencies.id)
            .notNull(),
        contentHash: text("content_hash").unique().notNull(),

        cause: alertCauseEnum("cause").default(AlertCause.UNKNOWN_CAUSE),
        effect: alertEffectEnum("effect").default(AlertEffect.UNKNOWN_EFFECT),
        severity: alertSeverityEnum("severity").default(AlertSeverity.UNKNOWN_SEVERITY),

        headerText: jsonb("header_text").$type<TranslationMap>().notNull(),
        descriptionText: jsonb("description_text").$type<TranslationMap>().notNull(),
        url: jsonb("url").$type<TranslationMap>(),

        activePeriods: jsonb("active_periods").$type<TimePeriod[]>(),
        informedEntities: jsonb("informed_entities").$type<EntitySelector[]>(),

        lastSeen: timestamp("last_seen", { withTimezone: true }).defaultNow(),
    },
    (t) => [
        // JSONB Indexing is critical for 'informed_entities' queries
        index("idx_alerts_informed_entities_gin").using("gin", t.informedEntities),
        index("idx_alerts_active_periods_gin").using("gin", t.activePeriods),
    ]
);

// =========================================================
// MATERIALIZED VIEW: routes_by_stop
// =========================================================

// export const routesByStop = pgMaterializedView("routes_by_stop", {
//     stopId: integer("stop_id").notNull(),
//     routeIds: integer("route_ids").array().notNull(),
//     agencyId: text("agency_id").notNull(),
// }).using("btree");

// =========================================================
// RELATIONS
// =========================================================

export const tripRelations = relations(trips, ({ one, many }) => ({
    agency: one(agencies, { fields: [trips.agencyId], references: [agencies.id] }),
    route: one(routes, { fields: [trips.routeId], references: [routes.id] }),
    shape: one(shapes, { fields: [trips.shapeId], references: [shapes.id] }),
    stopTimes: many(stopTimes),
}));

export const stopTimeRelations = relations(stopTimes, ({ one }) => ({
    trip: one(trips, { fields: [stopTimes.tripId], references: [trips.id] }),
    stop: one(stops, { fields: [stopTimes.stopId], references: [stops.id] }),
}));

export const tripInstanceRelations = relations(tripInstances, ({ one, many }) => ({
    trip: one(trips, { fields: [tripInstances.tripId], references: [trips.id] }),
    vehicle: one(vehicles, { fields: [tripInstances.vehicleId], references: [vehicles.id] }),
    stopTimeInstances: many(stopTimeInstances),
    positions: many(vehiclePositions),
}));

export const stopTimeInstanceRelations = relations(stopTimeInstances, ({ one }) => ({
    tripInstance: one(tripInstances, {
        fields: [stopTimeInstances.tripInstanceId],
        references: [tripInstances.id],
    }),
    stopTime: one(stopTimes, {
        fields: [stopTimeInstances.stopTimeId],
        references: [stopTimes.id],
    }),
}));

export const vehiclePositionRelations = relations(vehiclePositions, ({ one }) => ({
    tripInstance: one(tripInstances, {
        fields: [vehiclePositions.tripInstanceId],
        references: [tripInstances.id],
    }),
}));
