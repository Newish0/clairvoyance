import { StopRepository } from "../repositories/stop-repository";
import { publicProcedure, router } from "../trpc";
import * as v from "valibot";

export const stopRouter = router({
    getGeojson: publicProcedure
        .input(
            v.object({
                agencyId: v.string(),
                stopId: v.union([v.string(), v.array(v.string())]),
            })
        )
        .query(async ({ input, ctx }) => {
            const stopIds = Array.isArray(input.stopId) ? input.stopId : [input.stopId];
            const stopRepo = new StopRepository(ctx.db);
            const geoJson = await stopRepo.findGeoJson(input.agencyId, stopIds);
            return geoJson;
        }),

    getNearby: publicProcedure
        .input(
            v.union([
                v.object({
                    lat: v.number(),
                    lng: v.number(),
                    radius: v.pipe(
                        v.number(),
                        v.minValue(100),
                        v.maxValue(5000),
                        v.description("Radius in meters")
                    ),
                }),
                v.object({
                    lat: v.number(),
                    lng: v.number(),
                    bbox: v.object({
                        minLat: v.number(),
                        maxLat: v.number(),
                        minLng: v.number(),
                        maxLng: v.number(),
                    }),
                }),
            ])
        )
        .query(async ({ input, ctx }) => {
            const stopRepo = new StopRepository(ctx.db);
            const data = await stopRepo.findNearbyStops(input);
            return data;
        }),
});
