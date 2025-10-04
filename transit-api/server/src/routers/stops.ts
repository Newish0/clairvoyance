import { StopRepository } from "@/repositories/stop-repository";
import { publicProcedure, router } from "@/trpc";
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
});
