import * as v from "valibot";
import { StopRepository } from "../repositories/stop-repository";
import { publicProcedure, router } from "../trpc";

export const stopRouter = router({
    getById: publicProcedure
        .input(v.union([v.pipe(v.number(), v.integer()), v.array(v.pipe(v.number(), v.integer()))]))
        .query(async ({ input, ctx }) => {
            const stopIds = Array.isArray(input) ? input : [input];
            const stopRepo = new StopRepository(ctx.db);
            const stops = await stopRepo.findAllStopsByIds(stopIds);
            return stops;
        }),

    getNearby: publicProcedure
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
            const stopRepo = new StopRepository(ctx.db);
            const data = await stopRepo.findNearbyStops(input);
            return data;
        }),
});
