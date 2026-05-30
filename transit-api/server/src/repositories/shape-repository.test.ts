import { beforeAll, afterAll, beforeEach, test, expect } from "bun:test";
import { createTestDatabase } from "../test-utils/db";
import { createCaller } from "../test-utils/trpc";
import { seedAgency } from "../test-utils/seed";
import { truncateAll } from "../test-utils/truncate";
import { shapes } from "database";
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

async function seedShape(agencyId: string, shapeSid: string) {
    const [result] = await db.db
        .insert(shapes)
        .values({
            agencyId,
            shapeSid,
            path: sql`ST_GeomFromText('LINESTRING(-71.0589 42.3601, -71.0580 42.3610)', 4326)`,
        })
        .returning({ id: shapes.id, shapeSid: shapes.shapeSid, agencyId: shapes.agencyId });
    return result;
}

test("shape.getGeoJson returns shape by agency and shapeSid", async () => {
    const agency = await seedAgency(db.db);
    await seedShape(agency.id, "SHP1");

    const caller = createCaller(db.db);
    const result = await caller.shape.getGeoJson({
        agencyId: agency.id,
        shapeId: "SHP1",
    });

    const shape = result.unwrapOr(null);
    expect(shape).not.toBeNull();
    expect(shape!.type).toBe("Feature");
    expect(shape!.properties.shapeSid).toBe("SHP1");
});

test("shape.getGeoJson returns shape by shapeObjectId", async () => {
    const agency = await seedAgency(db.db);
    const shapeRecord = await seedShape(agency.id, "SHP1");

    const caller = createCaller(db.db);
    const result = await caller.shape.getGeoJson({
        shapeObjectId: String(shapeRecord.id),
    });

    const shape = result.unwrapOr(null);
    expect(shape).not.toBeNull();
    expect(shape!.type).toBe("Feature");
    expect(shape!.properties.shapeSid).toBe("SHP1");
});

test("shape.getGeoJson returns null for missing shape", async () => {
    const agency = await seedAgency(db.db);

    const caller = createCaller(db.db);
    const result = await caller.shape.getGeoJson({
        agencyId: agency.id,
        shapeId: "NOPE",
    });

    const shape = result.unwrapOr(null);
    expect(shape).toBeNull();
});
