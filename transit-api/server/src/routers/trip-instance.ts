import { directionEnum } from "database";
import * as v from "valibot";
import { TripInstancesRepository } from "../repositories/trip-instance-repository";
import { publicProcedure, router } from "../trpc";

export const tripInstanceRouter = router({
    getById: publicProcedure
        .input(v.pipe(v.number(), v.integer()))
        .query(async ({ input: tripInstanceId, ctx }) => {
            const repo = new TripInstancesRepository(ctx.db);
            const data = await repo.findById(tripInstanceId);
            return data;
        }),
    getNearbyActive: publicProcedure
        .input(
            v.object({
                lat: v.number(),
                lng: v.number(),
                radiusMeters: v.pipe(
                    v.number(),
                    v.minValue(100),
                    v.maxValue(5000),
                    v.description("Radius in meters"),
                ),
            }),
        )
        .query(async ({ input, ctx }) => {
            const repo = new TripInstancesRepository(ctx.db);
            const data = await repo.findNearbyActiveTrips(input);
            return data;
        }),
    getNearbyInactive: publicProcedure
        .input(
            v.object({
                lat: v.number(),
                lng: v.number(),
                radiusMeters: v.pipe(
                    v.number(),
                    v.minValue(100),
                    v.maxValue(5000),
                    v.description("Radius in meters"),
                ),
            }),
        )
        .query(async ({ input, ctx }) => {
            const repo = new TripInstancesRepository(ctx.db);
            const active = await repo.findNearbyActiveTrips(input);
            const exclude = active
                .filter((t) => t.direction)
                .map((t) => ({ routeId: t.routeId, direction: t.direction! }));
            const inactive = await repo.findNearbyInactiveTrips({ ...input, exclude });
            return inactive;
        }),
    getUpcomingDepartures: publicProcedure
        .input(
            v.object({
                stopId: v.pipe(v.number(), v.integer()),
                routeId: v.pipe(v.number(), v.integer()),
                direction: v.picklist(directionEnum.enumValues),
                after: v.optional(v.date()),
                limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(50))),
                stillAtStopToleranceMeters: v.optional(v.number()),
                effectiveTimeToleranceSec: v.optional(v.number()),
                realtimeMaxAgeMs: v.optional(v.number()),
                tripInstanceLookbackHours: v.optional(v.number()),
                tripInstanceLookaheadHours: v.optional(v.number()),
            }),
        )
        .query(async ({ input, ctx }) => {
            const repo = new TripInstancesRepository(ctx.db);
            const data = await repo.findUpcomingDepartures(input);
            return data;
        }),
    getDepartures: publicProcedure
        .input(
            v.object({
                stopId: v.pipe(v.number(), v.integer()),
                routeId: v.pipe(v.number(), v.integer()),
                direction: v.picklist(directionEnum.enumValues),
                from: v.date(),
                to: v.optional(v.date()),
                limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100))),
                offset: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
                stillAtStopToleranceMeters: v.optional(v.number()),
                realtimeMaxAgeMs: v.optional(v.number()),
            }),
        )
        .query(async ({ input, ctx }) => {
            const repo = new TripInstancesRepository(ctx.db);
            const data = await repo.findDepartures(input);
            return data;
        }),
});
