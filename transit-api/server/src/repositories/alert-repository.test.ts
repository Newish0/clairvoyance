import { beforeAll, afterAll, beforeEach, test, expect } from "bun:test";
import { createTestDatabase } from "../test-utils/db";
import { createCaller } from "../test-utils/trpc";
import { seedAgency, seedAlert } from "../test-utils/seed";
import { truncateAll } from "../test-utils/truncate";
import { sql } from "drizzle-orm";

function jsonbArray(arr: unknown[]) {
    return sql.raw(`'${JSON.stringify(arr)}'::jsonb`) as any;
}

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

test("getActiveAlerts returns alerts matching agency filter", async () => {
    const agency = await seedAgency(db.db);
    await seedAlert(db.db, agency.id, {
        contentHash: "test-hash-1",
        headerText: { default: "Test Alert", en: "Test Alert" },
        descriptionText: { default: "Test Description", en: "Test Description" },
        activePeriods: jsonbArray([{ start: "2026-01-01T00:00:00Z", end: "2027-01-01T00:00:00Z" }]),
        informedEntities: jsonbArray([{ agencyId: agency.id, routeId: 1 }]),
    });

    const caller = createCaller(db.db);
    const result = await caller.alert.getActiveAlerts({
        agencyId: agency.id,
    });

    expect(result).toHaveLength(1);
    expect(result[0].headerText).toEqual({ default: "Test Alert", en: "Test Alert" });
});

test("getActiveAlerts returns empty for non-matching agency", async () => {
    const agency = await seedAgency(db.db);
    await seedAlert(db.db, agency.id, {
        contentHash: "test-hash-2",
        headerText: { default: "Other Alert", en: "Other Alert" },
        descriptionText: { default: "Desc", en: "Desc" },
        activePeriods: jsonbArray([{ start: "2026-01-01T00:00:00Z", end: "2027-01-01T00:00:00Z" }]),
        informedEntities: jsonbArray([{ agencyId: agency.id, routeId: 1 }]),
    });

    const caller = createCaller(db.db);
    const result = await caller.alert.getActiveAlerts({
        agencyId: "nonexistent-agency",
    });

    expect(result).toHaveLength(0);
});

test("getActiveAlerts matches by routeId", async () => {
    const agency = await seedAgency(db.db);
    await seedAlert(db.db, agency.id, {
        contentHash: "test-hash-3",
        headerText: { default: "Route Alert", en: "Route Alert" },
        descriptionText: { default: "Desc", en: "Desc" },
        activePeriods: jsonbArray([{ start: "2026-01-01T00:00:00Z", end: "2027-01-01T00:00:00Z" }]),
        informedEntities: jsonbArray([{ agencyId: agency.id, routeId: 42 }]),
    });

    const caller = createCaller(db.db);
    const result = await caller.alert.getActiveAlerts({
        routeId: 42,
    });

    expect(result).toHaveLength(1);
    expect(result[0].headerText).toEqual({ default: "Route Alert", en: "Route Alert" });
});

test("getActiveAlerts does not match inactive alerts", async () => {
    const agency = await seedAgency(db.db);
    await seedAlert(db.db, agency.id, {
        contentHash: "test-hash-4",
        headerText: { default: "Expired Alert", en: "Expired Alert" },
        descriptionText: { default: "Desc", en: "Desc" },
        activePeriods: jsonbArray([{ start: "2020-01-01T00:00:00Z", end: "2021-01-01T00:00:00Z" }]),
        informedEntities: jsonbArray([{ agencyId: agency.id }]),
    });

    const caller = createCaller(db.db);
    const result = await caller.alert.getActiveAlerts({
        agencyId: agency.id,
    });

    expect(result).toHaveLength(0);
});
