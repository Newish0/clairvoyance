import { ShapeRepository } from "@/repositories/shape-repository";
import { publicProcedure, router } from "../trpc";
import * as v from "valibot";

export const shapeRouter = router({
    getGeoJson: publicProcedure
        .input(
            v.object({
                agencyId: v.string(),
                shapeId: v.string(),
            })
        )
        .query(async ({ input: { agencyId, shapeId }, ctx }) => {
            const shapeRepo = new ShapeRepository(ctx.db);
            const geoJson = await shapeRepo.findGeoJson(agencyId, shapeId);
            return geoJson;
        }),
});
