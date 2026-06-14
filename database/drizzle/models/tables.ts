import {
    type AnyPgColumn,
    char,
    doublePrecision,
    index,
    integer,
    jsonb,
    primaryKey,
    serial,
    text,
    timestamp,
    unique,
    varchar,
} from "drizzle-orm/pg-core";
import {
    alertCauseEnum,
    alertEffectEnum,
    alertSeverityEnum,
    calendarExceptionTypeEnum,
    congestionLevelEnum,
    directionEnum,
    locationTypeEnum,
    occupancyStatusEnum,
    pickupDropOffEnum,
    routeTypeEnum,
    stopTimeUpdateScheduleRelationshipEnum,
    timepointEnum,
    tripInstanceStateEnum,
    vehicleStopStatusEnum,
    wheelchairBoardingEnum,
} from "./enums";
import { geometryLineString, geometryPoint } from "./postgis-types";
import { schema } from "./schema";
import type { EntitySelector, TimePeriod, TranslationMap } from "./types";

// =========================================================
// TABLES
// =========================================================

export const agencies = schema.table("agencies", {
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

export const feedInfo = schema.table(
    "feed_info",
    {
        hash: text("hash").primaryKey(),
        agencyId: text("agency_id")
            .references(() => agencies.id)
            .notNull(),
        publisherName: text("publisher_name"),
        publisherUrl: text("publisher_url"),
        lang: varchar("lang", { length: 10 }),
        version: text("version"),
        startDate: varchar("start_date", { length: 8 }), // YYYYMMDD
        endDate: varchar("end_date", { length: 8 }), // YYYYMMDD
    },
    (t) => [
        unique("uq_feed_info_feed_hash").on(t.hash),
        index("idx_feed_info_agency_id").on(t.agencyId),
    ],
);

export const routes = schema.table(
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
    (t) => [unique("uq_routes_agency_route_sid").on(t.agencyId, t.routeSid)],
);

export const shapes = schema.table(
    "shapes",
    {
        id: serial("id").primaryKey(),
        agencyId: text("agency_id")
            .notNull()
            .references(() => agencies.id),
        shapeSid: text("shape_sid").notNull(),

        path: geometryLineString("path").notNull(),
        distancesTraveled: jsonb("distances_traveled").$type<number[]>(),
    },
    (t) => [
        unique("uq_shapes_agency_shape_sid").on(t.agencyId, t.shapeSid),
        index("idx_shapes_path_gist").using("gist", t.path),
        index("idx_shapes_shape_sid").on(t.shapeSid),
    ],
);

export const vehicles = schema.table(
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
    (t) => [unique("uq_vehicles_agency_vehicle_sid").on(t.agencyId, t.vehicleSid)],
);

export const trips = schema.table(
    "trips",
    {
        id: serial("id").primaryKey(),
        agencyId: text("agency_id")
            .references(() => agencies.id)
            .notNull(),
        routeId: integer("route_id")
            .references(() => routes.id)
            .notNull(),
        shapeId: integer("shape_id").references(() => shapes.id),
        tripSid: text("trip_sid").notNull(),
        serviceSid: text("service_sid").notNull(),

        headsign: text("headsign"),
        shortName: text("short_name"),
        direction: directionEnum("direction"),
        blockId: text("block_id"),
    },
    (t) => [
        unique("uq_trips_agency_trip_sid").on(t.agencyId, t.tripSid),
        index("idx_trips_agency_service").on(t.agencyId, t.serviceSid),
    ],
);

export const stops = schema.table(
    "stops",
    {
        id: serial("id").primaryKey(),
        agencyId: text("agency_id")
            .references(() => agencies.id)
            .notNull(),
        stopSid: text("stop_sid").notNull(),

        code: text("code"),
        name: text("name"),
        description: text("description"),
        location: geometryPoint("location"),
        zoneId: text("zone_id"),
        url: text("url"),
        locationType: locationTypeEnum("location_type"),

        // Self-reference using explicit type to avoid circular inference issues
        parentStationId: integer("parent_station_id").references((): AnyPgColumn => stops.id),

        timezone: text("timezone"),
        wheelchairBoarding: wheelchairBoardingEnum("wheelchair_boarding"),
    },
    (t) => [
        unique("uq_stops_agency_stop_sid").on(t.agencyId, t.stopSid),
        index("idx_stops_location_gist").using("gist", t.location),
    ],
);

export const calendarDates = schema.table(
    "calendar_dates",
    {
        agencyId: text("agency_id")
            .references(() => agencies.id)
            .notNull(),
        serviceSid: text("service_sid").notNull(),
        date: varchar("date", { length: 8 }).notNull(), // YYYYMMDD
        exceptionType: calendarExceptionTypeEnum("exception_type").notNull(),
    },
    (t) => [
        primaryKey({ columns: [t.agencyId, t.serviceSid, t.date] }),
        index("idx_calendar_dates_agency_date").on(t.agencyId, t.date),
    ],
);

export const stopTimes = schema.table(
    "stop_times",
    {
        id: serial("id").primaryKey(),

        agencyId: text("agency_id")
            .references(() => agencies.id)
            .notNull(),
        tripId: integer("trip_id").references(() => trips.id),
        stopId: integer("stop_id").references(() => stops.id),
        tripSid: text("trip_sid").notNull(),
        stopSid: text("stop_sid").notNull(),

        /** GTFS doc: The values must increase along the trip but do not need to be consecutive. */
        stopSequence: integer("stop_sequence").notNull(),

        arrivalTime: char("arrival_time", { length: 8 }), // HH:MM:SS format, can exceed 24 hours
        departureTime: char("departure_time", { length: 8 }), // HH:MM:SS format, can exceed 24 hours

        stopHeadsign: text("stop_headsign"),
        pickupType: pickupDropOffEnum("pickup_type"),
        dropOffType: pickupDropOffEnum("drop_off_type"),
        timepoint: timepointEnum("timepoint").default("EXACT"),
        shapeDistTraveled: doublePrecision("shape_dist_traveled"),
    },
    (t) => [
        unique("uq_stop_times_agency_trip_sequence").on(t.agencyId, t.tripSid, t.stopSequence),
        index("idx_stop_times_trip_id_sequence").on(t.tripId, t.stopSequence),
        index("idx_stop_times_stop_id").on(t.stopId),
    ],
);

export const tripInstances = schema.table(
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

        state: tripInstanceStateEnum("state").notNull().default("PRISTINE"),

        /** The last time this row was updated a matching realtime trip update */
        lastTripUpdateAt: timestamp("last_trip_update_at", {
            withTimezone: true,
        }),
    },
    (t) => [
        unique("uq_trip_instances_trip_start_date_start_time").on(
            t.tripId,
            t.startDate,
            t.startTime,
        ),
        index("idx_trip_instances_trip_date_time_state").on(
            t.tripId,
            t.startDate,
            t.startTime,
            t.state,
        ),
    ],
);

/**
 * A stopTimeRealtimeInstance is ONLY generated when a realtime trip update arrives.
 * It contains all the realtime fields from realtime trip updates (and some static values if realtime counterpart is missing).
 * For static stopTimes, we use the static stopTimesStaticInstances view.
 */
export const stopTimeRealtimeInstances = schema.table(
    "stop_time_realtime_instances",
    {
        // PK
        id: serial("id").primaryKey(),

        // FKs
        tripInstanceId: integer("trip_instance_id")
            .references(() => tripInstances.id)
            .notNull(),
        stopTimeId: integer("stop_time_id").references(() => stopTimes.id),

        stopSequence: integer("stop_sequence").notNull(),
        stopId: integer("stop_id").references(() => stops.id),

        // TZ specified by agency.timezone per GTFS spec
        scheduledArrivalTime: timestamp("scheduled_arrival_time", { withTimezone: true }),
        scheduledDepartureTime: timestamp("scheduled_departure_time", { withTimezone: true }),

        predictedArrivalTime: timestamp("predicted_arrival_time", { withTimezone: true }),
        predictedDepartureTime: timestamp("predicted_departure_time", { withTimezone: true }),
        predictedArrivalUncertainty: integer("predicted_arrival_uncertainty"),
        predictedDepartureUncertainty: integer("predicted_departure_uncertainty"),

        // Per doc: Frequency-based trips (GTFS frequencies.txt with exact_times = 0) should not have a SCHEDULED value and should use UNSCHEDULED instead.
        scheduleRelationship:
            stopTimeUpdateScheduleRelationshipEnum("schedule_relationship").default("SCHEDULED"),

        stopHeadsign: text("stop_headsign"),
        pickupType: pickupDropOffEnum("pickup_type"),
        dropOffType: pickupDropOffEnum("drop_off_type"),

        lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true }).defaultNow(),
    },
    (t) => [
        index("idx_stop_time_instances_trip_instance_id").on(t.tripInstanceId),
        unique("uq_stop_time_instances__trip_instance_stop_sequence").on(
            t.tripInstanceId,
            t.stopSequence,
        ),
    ],
);

export const vehiclePositions = schema.table(
    "vehicle_positions",
    {
        id: serial("id").primaryKey(),
        vehicleId: integer("vehicle_id")
            .references(() => vehicles.id)
            .notNull(),
        tripInstanceId: integer("trip_instance_id").references(() => tripInstances.id),

        timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
        location: geometryPoint("location").notNull(),

        stopId: integer("stop_id").references(() => stops.id),
        currentStopSequence: integer("current_stop_sequence"),
        currentStatus: vehicleStopStatusEnum("current_status"),
        congestionLevel: congestionLevelEnum("congestion_level").default(
            "UNKNOWN_CONGESTION_LEVEL",
        ),
        occupancyStatus: occupancyStatusEnum("occupancy_status").default("NO_DATA_AVAILABLE"),
        occupancyPercentage: integer("occupancy_percentage"),

        bearing: doublePrecision("bearing"),
        odometer: doublePrecision("odometer"),
        speed: doublePrecision("speed"),
        shapeDistTraveled: doublePrecision("shape_dist_traveled"),

        ingestedAt: timestamp("ingested_at", { withTimezone: true }).defaultNow(),
    },
    (t) => [
        unique("uq_vehicle_positions_vehicle_timestamp").on(t.vehicleId, t.timestamp),
        index("idx_vehicle_positions_location_gist").using("gist", t.location),
    ],
);

export const alerts = schema.table(
    "alerts",
    {
        id: serial("id").primaryKey(),
        agencyId: text("agency_id")
            .references(() => agencies.id)
            .notNull(),
        contentHash: text("content_hash").unique().notNull(),

        cause: alertCauseEnum("cause").default("UNKNOWN_CAUSE"),
        effect: alertEffectEnum("effect").default("UNKNOWN_EFFECT"),
        severity: alertSeverityEnum("severity").default("UNKNOWN_SEVERITY"),

        headerText: jsonb("header_text").$type<TranslationMap>().notNull(),
        descriptionText: jsonb("description_text").$type<TranslationMap>().notNull(),
        url: jsonb("url").$type<TranslationMap>(),

        activePeriods: jsonb("active_periods").$type<TimePeriod[]>(),

        /**
         * @deprecated Kept for debugging/transition only. The source of truth for
         * "what does this alert apply to" is now the `alert_entities` join table,
         * which gives us indexed FK joins instead of JSONB containment queries.
         * Safe to remove once alert_entities has been validated in production.
         */
        informedEntities: jsonb("informed_entities").$type<EntitySelector[]>(),

        lastSeen: timestamp("last_seen", { withTimezone: true }).defaultNow(),
    },
    (t) => [
        // JSONB Indexing is critical for 'informed_entities' queries
        index("idx_alerts_informed_entities_gin").using("gin", t.informedEntities),
        index("idx_alerts_active_periods_gin").using("gin", t.activePeriods),
    ],
);

export const alertEntities = schema.table(
    "alert_entities",
    {
        id: serial("id").primaryKey(),
        alertId: integer("alert_id")
            .references(() => alerts.id, { onDelete: "cascade" })
            .notNull(),

        // One row per EntitySelector (one AND-group from GTFS-RT).
        // NULL means "this dimension wasn't specified" for that selector.
        agencyId: text("agency_id").references(() => agencies.id),
        routeId: integer("route_id").references(() => routes.id),
        routeType: routeTypeEnum("route_type"),
        direction: directionEnum("direction"),
        tripInstanceId: integer("trip_instance_id").references(() => tripInstances.id),
        stopId: integer("stop_id").references(() => stops.id),
    },
    (t) => [
        index("idx_alert_entities_alert_id").on(t.alertId),
        index("idx_alert_entities_route_id").on(t.routeId),
        index("idx_alert_entities_trip_instance_id").on(t.tripInstanceId),
        index("idx_alert_entities_stop_id").on(t.stopId),
        index("idx_alert_entities_agency_id").on(t.agencyId),
    ],
);
