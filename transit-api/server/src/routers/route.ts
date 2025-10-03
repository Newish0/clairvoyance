import { publicProcedure, router } from "@/trpc";
import * as v from "valibot";

export const routeRouter = router({
    liveTripPositions: publicProcedure
        .input(v.object({ routeId: v.string(), directionId: v.string() }))
        .query(function* ({ input: { routeId, directionId } }) {
            return { routeId, directionId }; // TODO
        }),
});
