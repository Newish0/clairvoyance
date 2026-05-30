import { beforeAll, afterAll, beforeEach, test, expect } from "bun:test";
import { createTestDatabase } from "../test-utils/db";
import { createCaller } from "../test-utils/trpc";
import { seedAgency, seedRoute, seedTrip, seedStopTime } from "../test-utils/seed";
import { truncateAll } from "../test-utils/truncate";
import { stops } from "database";
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

async function seedStopWithLocation(agencyId: string, stopSid: string, lng: number, lat: number) {
    const [result] = await db.db
        .insert(stops)
        .values({
            agencyId,
            stopSid,
            name: "Test Stop " + stopSid,
            location: sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)`,
        })
        .returning({ id: stops.id, stopSid: stops.stopSid });
    return result;
}

const TEST_LNG = -71.0589;
const TEST_LAT = 42.3601;

async function linkStopToRoute(agencyId: string, routeId: number, stopId: number, tripSid: string) {
    const trip = await seedTrip(db.db, agencyId, routeId, { tripSid });
    await seedStopTime(db.db, trip.id, stopId, trip.tripSid, "S1", agencyId);
}

// --- Repo-level tests ---

test("findNearbyRoutesByStop via repo by stopObjectId", async () => {
    const agency = await seedAgency(db.db);
    const route = await seedRoute(db.db, agency.id);
    const stop = await seedStopWithLocation(agency.id, "S1", TEST_LNG, TEST_LAT);
    await linkStopToRoute(agency.id, route.id, stop.id, "T1");

    const { RoutesByStopRepository } = await import("./routes-by-stop-repository");
    const repo = new RoutesByStopRepository(db.db);
    const result = await repo.findNearbyRoutesByStop({
        stopObjectId: String(stop.id),
    });

    expect(result).toHaveLength(1);
    expect(result[0].routeSid).toBe("R1");
});

test("findNearbyRoutesByStop via repo by agencyId and stopId", async () => {
    const agency = await seedAgency(db.db);
    const route = await seedRoute(db.db, agency.id, { routeSid: "R2" });
    const stop = await seedStopWithLocation(agency.id, "S1", TEST_LNG, TEST_LAT);
    await linkStopToRoute(agency.id, route.id, stop.id, "T1");

    const { RoutesByStopRepository } = await import("./routes-by-stop-repository");
    const repo = new RoutesByStopRepository(db.db);
    const result = await repo.findNearbyRoutesByStop({
        agencyId: agency.id,
        stopId: "S1",
    });

    expect(result).toHaveLength(1);
    expect(result[0].routeSid).toBe("R2");
});

test("findNearbyRoutesByStop returns empty for non-existent stop", async () => {
    const { RoutesByStopRepository } = await import("./routes-by-stop-repository");
    const repo = new RoutesByStopRepository(db.db);
    const result = await repo.findNearbyRoutesByStop({
        stopObjectId: "99999",
    });

    expect(result).toEqual([]);
});

test("findNearbyRoutesByStop returns empty when reference stop has no location", async () => {
    const agency = await seedAgency(db.db);
    const route = await seedRoute(db.db, agency.id);

    // Insert stop without location
    const [stop] = await db.db.insert(stops).values({
        agencyId: agency.id,
        stopSid: "S1",
        name: "No Location Stop",
    }).returning({ id: stops.id });
    await linkStopToRoute(agency.id, route.id, stop.id, "T1");

    const { RoutesByStopRepository } = await import("./routes-by-stop-repository");
    const repo = new RoutesByStopRepository(db.db);
    const result = await repo.findNearbyRoutesByStop({
        stopObjectId: String(stop.id),
    });

    expect(result).toEqual([]);
});

test("findNearbyRoutesByStop returns multiple routes at same stop", async () => {
    const agency = await seedAgency(db.db);
    const route1 = await seedRoute(db.db, agency.id, { routeSid: "R1" });
    const route2 = await seedRoute(db.db, agency.id, { routeSid: "R2" });
    const stop = await seedStopWithLocation(agency.id, "S1", TEST_LNG, TEST_LAT);

    await linkStopToRoute(agency.id, route1.id, stop.id, "T1");
    await linkStopToRoute(agency.id, route2.id, stop.id, "T2");

    const { RoutesByStopRepository } = await import("./routes-by-stop-repository");
    const repo = new RoutesByStopRepository(db.db);
    const result = await repo.findNearbyRoutesByStop({
        stopObjectId: String(stop.id),
    });

    expect(result).toHaveLength(2);
    const routeSids = result.map((r) => r.routeSid).sort();
    expect(routeSids).toEqual(["R1", "R2"]);
});

test("findNearbyRoutesByStop returns empty when serving stop is outside radius", async () => {
    const agency = await seedAgency(db.db);
    const route = await seedRoute(db.db, agency.id);
    // Stop A: has routes serving it
    const stopA = await seedStopWithLocation(agency.id, "A", -71.1000, 42.3500);
    await linkStopToRoute(agency.id, route.id, stopA.id, "T1");
    // Stop B: the reference stop, 100m+ away from stop A
    const stopB = await seedStopWithLocation(agency.id, "B", -71.0589, 42.3601);

    const { RoutesByStopRepository } = await import("./routes-by-stop-repository");
    const repo = new RoutesByStopRepository(db.db);
    const result = await repo.findNearbyRoutesByStop({
        stopObjectId: String(stopB.id),
    });

    // stopA's routes should NOT be found because stopA is far from stopB
    expect(result).toEqual([]);
});

// --- Router-level tests ---

test("getNearbyRoutesByStop via router by stopObjectId", async () => {
    const agency = await seedAgency(db.db);
    const route = await seedRoute(db.db, agency.id);
    const stop = await seedStopWithLocation(agency.id, "S1", TEST_LNG, TEST_LAT);
    await linkStopToRoute(agency.id, route.id, stop.id, "T1");

    const caller = createCaller(db.db);
    const result = await caller.stop.getNearbyRoutesByStop({
        stopObjectId: String(stop.id),
    });

    expect(result).toHaveLength(1);
    expect(result[0].routeSid).toBe("R1");
});

test("getNearbyRoutesByStop via router by agencyId and stopId", async () => {
    const agency = await seedAgency(db.db);
    const route = await seedRoute(db.db, agency.id, { routeSid: "R2" });
    const stop = await seedStopWithLocation(agency.id, "S1", TEST_LNG, TEST_LAT);
    await linkStopToRoute(agency.id, route.id, stop.id, "T1");

    const caller = createCaller(db.db);
    const result = await caller.stop.getNearbyRoutesByStop({
        agencyId: agency.id,
        stopId: "S1",
    });

    expect(result).toHaveLength(1);
    expect(result[0].routeSid).toBe("R2");
});

test("getNearbyRoutesByStop via router returns empty for stop without location", async () => {
    const agency = await seedAgency(db.db);
    const [stop] = await db.db.insert(stops).values({
        agencyId: agency.id,
        stopSid: "S1",
        name: "No Location",
    }).returning({ id: stops.id });

    const caller = createCaller(db.db);
    const result = await caller.stop.getNearbyRoutesByStop({
        stopObjectId: String(stop.id),
    });

    expect(result).toEqual([]);
});
