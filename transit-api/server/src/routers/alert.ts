import { publicProcedure, router } from "../trpc";
import * as v from "valibot";

const entitySelectionQuery = v.object({
    agencyId: v.optional(v.string()),
    routeType: v.optional(v.string()),
    routeId: v.optional(v.string()),
    directionId: v.optional(v.string()),
    stopId: v.optional(v.union([v.string(), v.array(v.string())])),
    tripInstanceId: v.optional(v.string()),
});

export const alertRouter = router({
    getActive: publicProcedure.input(entitySelectionQuery).query(async ({ input, ctx }) => {
        return input; // TODO
    }),
    onActiveChange: publicProcedure
        .input(entitySelectionQuery)
        .subscription(async function* ({ input, signal }) {
            yield input; // TODO
        }),
});
