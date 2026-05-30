import {
    agencies,
    routes,
    stops,
    trips,
    tripInstances,
    stopTimes,
    vehicles,
    alerts,
    RouteType,
    TripInstanceState,
    AlertCause,
    AlertEffect,
    AlertSeverity,
} from "database";

let agencyCounter = 0;
export async function seedAgency(
    db: any,
    overrides?: Partial<typeof agencies.$inferInsert>,
) {
    agencyCounter++;
    const [result] = await db
        .insert(agencies)
        .values({
            id: `test-agency-${agencyCounter}`,
            agencySid: `test-agency-sid-${agencyCounter}`,
            name: "Test Transit Authority",
            url: "https://example.com",
            timezone: "America/New_York",
            ...overrides,
        })
        .returning();
    return result;
}

export async function seedRoute(
    db: any,
    agencyId: string,
    overrides?: Partial<typeof routes.$inferInsert>,
) {
    const [result] = await db
        .insert(routes)
        .values({
            agencyId,
            routeSid: "R1",
            shortName: "101",
            longName: "Test Route 101",
            type: RouteType.BUS,
            ...overrides,
        })
        .returning();
    return result;
}

export async function seedStop(
    db: any,
    agencyId: string,
    overrides?: Omit<Partial<typeof stops.$inferInsert>, "location"> & { location?: any },
) {
    const [result] = await db
        .insert(stops)
        .values({
            agencyId,
            stopSid: "S1",
            name: "Test Stop",
            ...overrides,
        })
        .returning();
    return result;
}

export async function seedTrip(
    db: any,
    agencyId: string,
    routeId: number,
    overrides?: Partial<typeof trips.$inferInsert>,
) {
    const [result] = await db
        .insert(trips)
        .values({
            agencyId,
            routeId,
            tripSid: "T1",
            serviceSid: "SERVICE1",
            headsign: "Test Headsign",
            ...overrides,
        })
        .returning();
    return result;
}

export async function seedTripInstance(
    db: any,
    tripId: number,
    routeId: number,
    agencyId: string,
    overrides?: Partial<typeof tripInstances.$inferInsert>,
) {
    const [result] = await db
        .insert(tripInstances)
        .values({
            agencyId,
            tripId,
            routeId,
            startDate: "20260522",
            startTime: "12:00:00",
            startDatetime: new Date("2026-05-22T12:00:00Z"),
            state: TripInstanceState.PRISTINE,
            ...overrides,
        })
        .returning();
    return result;
}

export async function seedVehicle(
    db: any,
    agencyId: string,
    overrides?: Partial<typeof vehicles.$inferInsert>,
) {
    const [result] = await db
        .insert(vehicles)
        .values({
            agencyId,
            vehicleSid: "V1",
            ...overrides,
        })
        .returning({ id: vehicles.id });
    return result;
}

export async function seedAlert(
    db: any,
    agencyId: string,
    overrides?: Partial<typeof alerts.$inferInsert> & {
        activePeriods?: any;
        informedEntities?: any;
    },
) {
    const [result] = await db
        .insert(alerts)
        .values({
            agencyId,
            contentHash: `test-hash-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            headerText: { default: "Test Alert" },
            descriptionText: { default: "Test Description" },
            cause: AlertCause.UNKNOWN_CAUSE,
            effect: AlertEffect.UNKNOWN_EFFECT,
            severity: AlertSeverity.UNKNOWN_SEVERITY,
            ...overrides,
        })
        .returning();
    return result;
}

export async function seedStopTime(
    db: any,
    tripId: number,
    stopId: number,
    tripSid: string,
    stopSid: string,
    agencyId: string,
    overrides?: Partial<typeof stopTimes.$inferInsert>,
) {
    const [result] = await db
        .insert(stopTimes)
        .values({
            agencyId,
            tripId,
            stopId,
            tripSid,
            stopSid,
            stopSequence: 1,
            arrivalTime: "12:00:00",
            departureTime: "12:05:00",
            ...overrides,
        })
        .returning();
    return result;
}
