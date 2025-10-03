import { publicProcedure, router } from "@/trpc";
import * as v from "valibot";

export const stopRouter = router({
    getGeojson: publicProcedure
        .input(v.union([v.string(), v.array(v.string())]))
        .query(async ({ input }) => {
            const stopIds = Array.isArray(input) ? input : [input];

            return stopIds; // TODO
        }),
});
