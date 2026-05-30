import { beforeAll, afterAll, beforeEach, test, expect } from "bun:test";
import { createTestDatabase } from "../test-utils/db";
import { seedAgency, seedRoute, seedTrip, seedTripInstance } from "../test-utils/seed";
import { truncateAll } from "../test-utils/truncate";
import { vehiclePositions, vehicles } from "database";
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

test("vehiclePosition findById returns a vehicle position", async () => {
    const agency = await seedAgency(db.db);
    const route = await seedRoute(db.db, agency.id);
    const trip = await seedTrip(db.db, agency.id, route.id);
    const instance = await seedTripInstance(db.db, trip.id, route.id, agency.id);

    const [vehicle] = await db.db
        .insert(vehicles)
        .values({ agencyId: agency.id, vehicleSid: "V1" })
        .returning({ id: vehicles.id });

    const [pos] = await db.db
        .insert(vehiclePositions)
        .values({
            vehicleId: vehicle.id,
            tripInstanceId: instance.id,
            timestamp: new Date(),
            location: sql`ST_SetSRID(ST_MakePoint(-71.0589, 42.3601), 4326)`,
        })
        .returning({ id: vehiclePositions.id });

    const { VehiclePositionRepository } = await import("./vehicle-position-repository");
    const repo = new VehiclePositionRepository(db.db);
    const result = await repo.findById(pos.id);

    expect(result).not.toBeNull();
    expect(result!.id).toBe(pos.id);
});

test("vehiclePosition findById returns null for non-existent ID", async () => {
    const { VehiclePositionRepository } = await import("./vehicle-position-repository");
    const repo = new VehiclePositionRepository(db.db);
    const result = await repo.findById(99999);

    expect(result).toBeNull();
});
