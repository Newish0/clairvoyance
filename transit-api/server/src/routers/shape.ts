import { publicProcedure, router } from "../trpc";
import * as v from "valibot";

export const shapeRouter = router({
    getGeoJson: publicProcedure.input(v.string()).query(async ({ input: shapeId }) => {
        return shapeId; // TODO: return geojson
    }),
});
