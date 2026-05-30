import { beforeAll, afterAll, beforeEach, test, expect } from "bun:test";
import { createTestDatabase } from "../test-utils/db";
import { createCaller } from "../test-utils/trpc";
import { seedAgency, seedRoute, seedTrip, seedTripInstance, seedStop, seedVehicle } from "../test-utils/seed";
import { truncateAll } from "../test-utils/truncate";
import { stops, stopTimes, vehiclePositions, stopTimeRealtimeInstances, Direction, TripInstanceState } from "database";
import { sql } from "drizzle-orm";

let db: Awaited<ReturnType<typeof createTestDatabase>>;

beforeAll(async () => {
    db = await createTestDatabase();
});

beforeEach(async () => {
    await truncateAll(db.db);
});

afterAll(async () => {
    await db.teardown();
});

async function refreshStaticView() {
    await db.db.execute(sql.raw("REFRESH MATERIALIZED VIEW transit.stop_time_static_instances"));
}

// --- getFullById ---

test("tripInstance.getFullById returns a full trip instance by ID", async () => {
    const agency = await seedAgency(db.db);
    const route = await seedRoute(db.db, agency.id);
    const trip = await seedTrip(db.db, agency.id, route.id);
    const tripInstance = await seedTripInstance(db.db, trip.id, route.id, agency.id);

    const caller = createCaller(db.db);
    const result = await caller.tripInstance.getFullById(tripInstance.id);

    expect(result).not.toBeNull();
    const r = result!;
    expect(r.id).toBe(tripInstance.id);
    expect(r.tripId).toBe(trip.id);
    expect(r.routeId).toBe(route.id);
    expect(r.trip).toHaveLength(1);
    expect(r.trip[0].tripSid).toBe("T1");
    expect(r.route).toHaveLength(1);
    expect(r.route[0].routeSid).toBe("R1");
});

test("tripInstance.getFullById returns null for non-existent ID", async () => {
    const caller = createCaller(db.db);
    const result = await caller.tripInstance.getFullById(99999);

    expect(result).toBeNull();
});

// --- getByRouteStopTime ---

test("tripInstance.getByRouteStopTime finds trip instance at a stop within time window", async () => {
    const agency = await seedAgency(db.db);
    const route = await seedRoute(db.db, agency.id);
    const trip = await seedTrip(db.db, agency.id, route.id);
    const stop = await seedStop(db.db, agency.id, {
        stopSid: "STOP1",
        name: "Test Stop",
        location: sql`ST_SetSRID(ST_MakePoint(-71.0589, 42.3601), 4326)`,
    });
    const tripInstance = await seedTripInstance(db.db, trip.id, route.id, agency.id);

    // Link stop to trip via stop_time (first stop, sequence 1)
    await db.db.insert(stopTimes).values({
        agencyId: agency.id,
        tripId: trip.id,
        stopId: stop.id,
        tripSid: trip.tripSid,
        stopSid: stop.stopSid,
        stopSequence: 1,
        arrivalTime: "12:00:00",
        departureTime: "12:05:00",
    });

    // Refresh the materialized view to populate static stop time instances
    await refreshStaticView();

    const caller = createCaller(db.db);
    const result = await caller.tripInstance.getByRouteStopTime({
        routeId: route.id,
        stopId: stop.id,
        minDatetime: new Date("2026-05-22T10:00:00Z"),
        maxDatetime: new Date("2026-05-22T14:00:00Z"),
    });

    expect(result).not.toBeNull();
    expect(result.length).toBeGreaterThanOrEqual(1);
    // The merged row should contain trip_instance fields
    expect(result[0].tripId).toBe(trip.id);
    expect(result[0].routeId).toBe(route.id);
    // And the stopTimeInstances property should match the stop
    expect(result[0].stopTimeInstances).toBeDefined();
    expect(result[0].stopTimeInstances.stopId).toBe(stop.id);
});

test("tripInstance.getByRouteStopTime returns empty outside time window", async () => {
    const agency = await seedAgency(db.db);
    const route = await seedRoute(db.db, agency.id);
    const trip = await seedTrip(db.db, agency.id, route.id);
    const stop = await seedStop(db.db, agency.id, {
        stopSid: "STOP1",
        name: "Test Stop",
        location: sql`ST_SetSRID(ST_MakePoint(-71.0589, 42.3601), 4326)`,
    });
    const tripInstance = await seedTripInstance(db.db, trip.id, route.id, agency.id);

    await db.db.insert(stopTimes).values({
        agencyId: agency.id,
        tripId: trip.id,
        stopId: stop.id,
        tripSid: trip.tripSid,
        stopSid: stop.stopSid,
        stopSequence: 1,
        arrivalTime: "12:00:00",
        departureTime: "12:05:00",
    });

    await refreshStaticView();

    const caller = createCaller(db.db);
    const result = await caller.tripInstance.getByRouteStopTime({
        routeId: route.id,
        stopId: stop.id,
        minDatetime: new Date("2026-05-23T10:00:00Z"),
        maxDatetime: new Date("2026-05-23T14:00:00Z"),
    });

    expect(result).toEqual([]);
});

// --- watchLivePositions ---

test("watchLivePositions yields initial data and polls for new positions", async () => {
    const agency = await seedAgency(db.db);
    const route = await seedRoute(db.db, agency.id);
    const trip = await seedTrip(db.db, agency.id, route.id);
    const instance = await seedTripInstance(db.db, trip.id, route.id, agency.id);
    const vehicle = await seedVehicle(db.db, agency.id);

    // Insert P1 with ingestedAt = epoch so the first poll ignores it
    await db.db
        .insert(vehiclePositions)
        .values({
            vehicleId: vehicle.id,
            tripInstanceId: instance.id,
            timestamp: new Date(),
            location: sql`ST_SetSRID(ST_MakePoint(-71.0589, 42.3601), 4326)`,
            ingestedAt: new Date(0),
        })
        .returning({ id: vehiclePositions.id });

    const { TripInstancesRepository } = await import("./trip-instance-repository");
    const repo = new TripInstancesRepository(db.db);

    const controller = new AbortController();
    const generator = repo.watchLivePositions({
        agencyId: agency.id,
        signal: controller.signal,
        getInitialData: true,
        pollIntervalMs: 50,
    });

    // First yield: initial data (P1)
    const { value: v1, done: d1 } = await generator.next();
    expect(d1).toBe(false);
    expect(v1).not.toBeNull();
    expect(v1!.tripInstanceId).toBe(instance.id);
    expect(v1!.latestPosition).not.toBeNull();

    // Insert P2 (poll should pick this up)
    const [pos2] = await db.db
        .insert(vehiclePositions)
        .values({
            vehicleId: vehicle.id,
            tripInstanceId: instance.id,
            timestamp: new Date(),
            location: sql`ST_SetSRID(ST_MakePoint(-71.0600, 42.3600), 4326)`,
        })
        .returning({ id: vehiclePositions.id });

    // Second yield: polled data (P2)
    const { value: v2, done: d2 } = await generator.next();
    expect(d2).toBe(false);
    expect(v2).not.toBeNull();
    expect(v2!.tripInstanceId).toBe(instance.id);
    expect(v2!.latestPosition).not.toBeNull();
    expect(v2!.latestPosition!.id).toBe(pos2.id);

    controller.abort();
    await generator.return?.(undefined);
});

// --- findNextAtStop ---

test("findNextAtStop returns upcoming trips at a stop", async () => {
    const agency = await seedAgency(db.db);
    const route = await seedRoute(db.db, agency.id);
    const trip = await seedTrip(db.db, agency.id, route.id);
    const stop = await seedStop(db.db, agency.id, {
        stopSid: "STOP1",
        name: "Test Stop",
        location: sql`ST_SetSRID(ST_MakePoint(-71.0589, 42.3601), 4326)`,
    });
    const future = new Date(Date.now() + 25 * 60 * 1000);
    const tripInstance = await seedTripInstance(db.db, trip.id, route.id, agency.id, {
        startDatetime: future,
    });

    await db.db.insert(stopTimes).values({
        agencyId: agency.id,
        tripId: trip.id,
        stopId: stop.id,
        tripSid: trip.tripSid,
        stopSid: stop.stopSid,
        stopSequence: 1,
        arrivalTime: "12:00:00",
        departureTime: "12:05:00",
    });

    await refreshStaticView();

    const { TripInstancesRepository } = await import("./trip-instance-repository");
    const repo = new TripInstancesRepository(db.db);
    const result = await repo.findNextAtStop({
        stopId: "STOP1",
        agencyId: agency.id,
    });

    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].id).toBe(tripInstance.id);
});

test("findNextAtStop returns empty for unknown stopSid", async () => {
    const { TripInstancesRepository } = await import("./trip-instance-repository");
    const repo = new TripInstancesRepository(db.db);
    const result = await repo.findNextAtStop({
        stopId: "NONEXISTENT",
        agencyId: "test-agency",
    });
    expect(result).toEqual([]);
});

test("findNextAtStop returns empty when no trips are scheduled", async () => {
    const agency = await seedAgency(db.db);
    const stop = await seedStop(db.db, agency.id, {
        stopSid: "STOP1",
        name: "Test Stop",
        location: sql`ST_SetSRID(ST_MakePoint(-71.0589, 42.3601), 4326)`,
    });

    const { TripInstancesRepository } = await import("./trip-instance-repository");
    const repo = new TripInstancesRepository(db.db);
    const result = await repo.findNextAtStop({
        stopId: "STOP1",
        agencyId: agency.id,
    });
    expect(result).toEqual([]);
});

test("findNextAtStop filters by routeId", async () => {
    const agency = await seedAgency(db.db);
    const route1 = await seedRoute(db.db, agency.id, { routeSid: "R1" });
    const route2 = await seedRoute(db.db, agency.id, { routeSid: "R2" });
    const trip1 = await seedTrip(db.db, agency.id, route1.id);
    const trip2 = await seedTrip(db.db, agency.id, route2.id, { tripSid: "T2" });
    const stop = await seedStop(db.db, agency.id, {
        stopSid: "STOP1",
        name: "Test Stop",
        location: sql`ST_SetSRID(ST_MakePoint(-71.0589, 42.3601), 4326)`,
    });
    const future = new Date(Date.now() + 25 * 60 * 1000);
    await seedTripInstance(db.db, trip1.id, route1.id, agency.id, { startDatetime: future });
    await seedTripInstance(db.db, trip2.id, route2.id, agency.id, { startDatetime: future });

    await db.db.insert(stopTimes).values([
        { agencyId: agency.id, tripId: trip1.id, stopId: stop.id, tripSid: trip1.tripSid, stopSid: stop.stopSid, stopSequence: 1, arrivalTime: "12:00:00", departureTime: "12:05:00" },
        { agencyId: agency.id, tripId: trip2.id, stopId: stop.id, tripSid: trip2.tripSid, stopSid: stop.stopSid, stopSequence: 1, arrivalTime: "12:00:00", departureTime: "12:05:00" },
    ]);

    await refreshStaticView();

    const { TripInstancesRepository } = await import("./trip-instance-repository");
    const repo = new TripInstancesRepository(db.db);
    const result = await repo.findNextAtStop({
        stopId: "STOP1",
        agencyId: agency.id,
        routeId: "R1",
    });

    expect(result.length).toBe(1);
    expect(result[0].route.routeSid).toBe("R1");
});

test("findNextAtStop excludes specified trip instance IDs", async () => {
    const agency = await seedAgency(db.db);
    const route = await seedRoute(db.db, agency.id);
    const trip = await seedTrip(db.db, agency.id, route.id);
    const stop = await seedStop(db.db, agency.id, {
        stopSid: "STOP1",
        name: "Test Stop",
        location: sql`ST_SetSRID(ST_MakePoint(-71.0589, 42.3601), 4326)`,
    });
    const future = new Date(Date.now() + 25 * 60 * 1000);
    const ti = await seedTripInstance(db.db, trip.id, route.id, agency.id, { startDatetime: future });

    await db.db.insert(stopTimes).values({
        agencyId: agency.id,
        tripId: trip.id,
        stopId: stop.id,
        tripSid: trip.tripSid,
        stopSid: stop.stopSid,
        stopSequence: 1,
        arrivalTime: "12:00:00",
        departureTime: "12:05:00",
    });

    await refreshStaticView();

    const { TripInstancesRepository } = await import("./trip-instance-repository");
    const repo = new TripInstancesRepository(db.db);
    const result = await repo.findNextAtStop({
        stopId: "STOP1",
        agencyId: agency.id,
        excludedTripInstanceIds: [String(ti.id)],
    });

    expect(result).toEqual([]);
});

// --- findNearbyTrips ---

test("findNearbyTrips returns trips near a location via radius", async () => {
    const agency = await seedAgency(db.db);
    const route = await seedRoute(db.db, agency.id);
    const trip = await seedTrip(db.db, agency.id, route.id);
    const stop = await seedStop(db.db, agency.id, {
        stopSid: "STOP1",
        name: "Nearby Stop",
        location: sql`ST_SetSRID(ST_MakePoint(-71.0589, 42.3601), 4326)`,
    });
    const future = new Date(Date.now() + 25 * 60 * 1000);
    await seedTripInstance(db.db, trip.id, route.id, agency.id, { startDatetime: future });

    await db.db.insert(stopTimes).values({
        agencyId: agency.id,
        tripId: trip.id,
        stopId: stop.id,
        tripSid: trip.tripSid,
        stopSid: stop.stopSid,
        stopSequence: 1,
        arrivalTime: "12:00:00",
        departureTime: "12:05:00",
    });

    await refreshStaticView();

    const { TripInstancesRepository } = await import("./trip-instance-repository");
    const repo = new TripInstancesRepository(db.db);
    const result = await repo.findNearbyTrips({
        lat: 42.3601,
        lng: -71.0589,
        radius: 1000,
    });

    expect(Object.keys(result).length).toBeGreaterThanOrEqual(1);
    const routeEntry = (result as Record<string, any>)["R1"];
    expect(routeEntry).toBeDefined();
    expect(Object.keys(routeEntry).length).toBeGreaterThanOrEqual(1);
    const directionEntries = Object.values(routeEntry)[0] as any[];
    expect(directionEntries.length).toBeGreaterThanOrEqual(1);
    expect(directionEntries[0].id).toBeGreaterThan(0);
});

test("findNearbyTrips returns empty when no stops nearby", async () => {
    const { TripInstancesRepository } = await import("./trip-instance-repository");
    const repo = new TripInstancesRepository(db.db);
    const result = await repo.findNearbyTrips({
        lat: 0,
        lng: 0,
        radius: 100,
    });
    expect(Object.keys(result).length).toBe(0);
});

// --- watchLiveStopTimes ---

test("watchLiveStopTimes yields new stop time realtime instances", async () => {
    const agency = await seedAgency(db.db);
    const route = await seedRoute(db.db, agency.id);
    const trip = await seedTrip(db.db, agency.id, route.id);
    const stop = await seedStop(db.db, agency.id, {
        stopSid: "STOP1",
        name: "Test Stop",
        location: sql`ST_SetSRID(ST_MakePoint(-71.0589, 42.3601), 4326)`,
    });
    const tripInstance = await seedTripInstance(db.db, trip.id, route.id, agency.id);

    // Need a stop_time row for the FK
    const [stopTime] = await db.db
        .insert(stopTimes)
        .values({
            agencyId: agency.id,
            tripId: trip.id,
            stopId: stop.id,
            tripSid: trip.tripSid,
            stopSid: stop.stopSid,
            stopSequence: 1,
            arrivalTime: "12:00:00",
            departureTime: "12:05:00",
        })
        .returning({ id: stopTimes.id });

    // Insert a stop time realtime instance BEFORE starting the generator
    // so we can test that old data is NOT yielded (lastPoll starts at epoch)
    await db.db.insert(stopTimeRealtimeInstances).values({
        tripInstanceId: tripInstance.id,
        stopTimeId: stopTime.id,
        stopSequence: 1,
        stopId: stop.id,
        lastUpdatedAt: new Date(0),
    });

    const { TripInstancesRepository } = await import("./trip-instance-repository");
    const repo = new TripInstancesRepository(db.db);

    const controller = new AbortController();
    const generator = repo.watchLiveStopTimes(
        [{ tripInstanceId: String(tripInstance.id), stopId: "STOP1" }],
        controller.signal,
        50,
    );

    // Insert a NEW stop time at a different stop sequence AFTER generator starts
    const [newRow] = await db.db
        .insert(stopTimeRealtimeInstances)
        .values({
            tripInstanceId: tripInstance.id,
            stopTimeId: stopTime.id,
            stopSequence: 2,
            stopId: stop.id,
        })
        .returning();

    const { value, done } = await generator.next();
    expect(done).toBe(false);
    expect(value).not.toBeNull();
    expect(value!.tripInstanceId).toBe(tripInstance.id);
    expect(value!.stopTimeId).toBe(stopTime.id);

    controller.abort();
    await generator.return?.(undefined);
});
