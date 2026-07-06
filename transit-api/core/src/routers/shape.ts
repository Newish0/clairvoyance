import * as v from "valibot";
import { ShapeRepository } from "../repositories/shape-repository";
import { publicProcedure, router } from "../trpc";

export const shapeRouter = router({
    getGeoJsonById: publicProcedure
        .input(v.pipe(v.number(), v.integer()))
        .query(async ({ input: shapeId, ctx }) => {
            const shapeRepo = new ShapeRepository(ctx.db);
            const geoJsonResult = await shapeRepo.findGeoJsonById(shapeId);

            return geoJsonResult.match((geoJson) => geoJson, () => null);
        }),
});
