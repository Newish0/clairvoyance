import { beforeAll, afterAll, beforeEach, test, expect } from "bun:test";
import { createTestDatabase } from "../test-utils/db";
import { createCaller } from "../test-utils/trpc";
import { seedAgency, seedRoute } from "../test-utils/seed";
import { truncateAll } from "../test-utils/truncate";

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

test("route.getById returns a route by its integer ID", async () => {
    const agency = await seedAgency(db.db);
    const route = await seedRoute(db.db, agency.id);

    const caller = createCaller(db.db);
    const result = await caller.route.getById(route.id);

    expect(result).not.toBeUndefined();
    expect(result!.shortName).toBe("101");
    expect(result!.routeSid).toBe("R1");
    expect(result!.agencyId).toBe(agency.id);
});

test("route.getById returns undefined for non-existent ID", async () => {
    const caller = createCaller(db.db);
    const result = await caller.route.getById(99999);

    expect(result).toBeUndefined();
});
