import { beforeAll, afterAll, beforeEach, test, expect } from "bun:test";
import { createTestDatabase } from "../test-utils/db";
import { createCaller } from "../test-utils/trpc";
import { seedAgency, seedStop } from "../test-utils/seed";
import { truncateAll } from "../test-utils/truncate";
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

async function seedStopAt(agencyId: string, stopSid: string, lng: number, lat: number) {
    return seedStop(db.db, agencyId, {
        stopSid,
        name: "Stop " + stopSid,
        location: sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)`,
    });
}

// Boston-area coordinates
const SOUTH_STATION = { lng: -71.0589, lat: 42.3601 };
const NEARBY = { lng: -71.0600, lat: 42.3610 }; // ~130m from South Station
const FAR = { lng: -71.1000, lat: 42.3500 }; // ~3.5km from South Station

test("stop.getStops returns stops by agency and stopSid", async () => {
    const agency = await seedAgency(db.db);
    await seedStopAt(agency.id, "S1", SOUTH_STATION.lng, SOUTH_STATION.lat);
    await seedStopAt(agency.id, "S2", NEARBY.lng, NEARBY.lat);

    const caller = createCaller(db.db);
    const result = await caller.stop.getStops({
        agencyId: agency.id,
        stopId: ["S1", "S2"],
    });

    expect(result).toHaveLength(2);
});

test("stop.getGeojson returns stops as GeoJSON by agency and stopSid", async () => {
    const agency = await seedAgency(db.db);
    await seedStopAt(agency.id, "S1", SOUTH_STATION.lng, SOUTH_STATION.lat);

    const caller = createCaller(db.db);
    const result = await caller.stop.getGeojson({
        agencyId: agency.id,
        stopId: ["S1"],
    });

    expect(result.type).toBe("FeatureCollection");
    expect(result.features).toHaveLength(1);
    expect(result.features[0].properties.stopSid).toBe("S1");
    expect(result.features[0].geometry.type).toBe("Point");
});

test("stop.getGeojson with single string stopId", async () => {
    const agency = await seedAgency(db.db);
    await seedStopAt(agency.id, "S1", SOUTH_STATION.lng, SOUTH_STATION.lat);

    const caller = createCaller(db.db);
    const result = await caller.stop.getGeojson({
        agencyId: agency.id,
        stopId: "S1",
    });

    expect(result.type).toBe("FeatureCollection");
    expect(result.features).toHaveLength(1);
    expect(result.features[0].properties.stopSid).toBe("S1");
});

test("stop.getNearby radius mode returns stops within range", async () => {
    const agency = await seedAgency(db.db);
    await seedStopAt(agency.id, "S1", SOUTH_STATION.lng, SOUTH_STATION.lat);
    await seedStopAt(agency.id, "S2", NEARBY.lng, NEARBY.lat); // ~130m
    await seedStopAt(agency.id, "S3", FAR.lng, FAR.lat); // ~3.5km

    const caller = createCaller(db.db);
    const result = await caller.stop.getNearby({
        lat: SOUTH_STATION.lat,
        lng: SOUTH_STATION.lng,
        radius: 200,
    });

    expect(result.length).toBeGreaterThanOrEqual(2);
    const sids = result.map((s: any) => s.id).sort();
    expect(result.every((s: any) => s.distance < 200)).toBe(true);
});

test("stop.getNearby radius mode excludes distant stops", async () => {
    const agency = await seedAgency(db.db);
    await seedStopAt(agency.id, "S1", SOUTH_STATION.lng, SOUTH_STATION.lat);
    await seedStopAt(agency.id, "S3", FAR.lng, FAR.lat);

    const caller = createCaller(db.db);
    const result = await caller.stop.getNearby({
        lat: SOUTH_STATION.lat,
        lng: SOUTH_STATION.lng,
        radius: 100,
    });

    expect(result).toHaveLength(1);
    expect(result[0].distance).toBeLessThan(1);
});

test("stop.getNearby bbox mode returns stops within bounding box", async () => {
    const agency = await seedAgency(db.db);
    await seedStopAt(agency.id, "S1", SOUTH_STATION.lng, SOUTH_STATION.lat);
    await seedStopAt(agency.id, "S2", NEARBY.lng, NEARBY.lat);
    await seedStopAt(agency.id, "S3", FAR.lng, FAR.lat);

    const caller = createCaller(db.db);
    const result = await caller.stop.getNearby({
        lat: SOUTH_STATION.lat,
        lng: SOUTH_STATION.lng,
        bbox: { minLat: 42.359, maxLat: 42.362, minLng: -71.062, maxLng: -71.057 },
    });

    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result.every((s: any) => s.distance < 300)).toBe(true);
});

test("stop.getNearby bbox mode excludes stops outside bounding box", async () => {
    const agency = await seedAgency(db.db);
    await seedStopAt(agency.id, "S1", SOUTH_STATION.lng, SOUTH_STATION.lat);
    await seedStopAt(agency.id, "S3", FAR.lng, FAR.lat);

    const caller = createCaller(db.db);
    const result = await caller.stop.getNearby({
        lat: SOUTH_STATION.lat,
        lng: SOUTH_STATION.lng,
        bbox: { minLat: 42.359, maxLat: 42.361, minLng: -71.060, maxLng: -71.057 },
    });

    expect(result).toHaveLength(1);
});

test("stop.getNearby returns empty when no stops nearby", async () => {
    const agency = await seedAgency(db.db);
    await seedStopAt(agency.id, "S1", FAR.lng, FAR.lat);

    const caller = createCaller(db.db);
    const result = await caller.stop.getNearby({
        lat: SOUTH_STATION.lat,
        lng: SOUTH_STATION.lng,
        radius: 100,
    });

    expect(result).toEqual([]);
});
