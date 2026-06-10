import * as v from "valibot";
import { TripInstancesRepository } from "../repositories/trip-instance-repository";
import { publicProcedure, router } from "../trpc";

export const tripInstanceRouter = router({
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
});
