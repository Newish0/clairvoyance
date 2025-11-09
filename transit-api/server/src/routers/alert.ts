import { Direction, RouteType } from "../../../../gtfs-processor/shared/gtfs-db-types";
import { AlertRepository } from "../repositories/alert-repository";
import { publicProcedure, router } from "../trpc";
import * as v from "valibot";

const entitySelectionQuery = v.object({
    agencyId: v.optional(v.string()),
    routeType: v.optional(v.enum(RouteType)),
    routeId: v.optional(v.string()),
    directionId: v.optional(v.enum(Direction)),
    stopId: v.optional(v.union([v.string(), v.array(v.string())])),
    tripInstanceId: v.optional(v.string()),
});

export const alertRouter = router({
    getActiveAlerts: publicProcedure.input(entitySelectionQuery).query(async ({ input, ctx }) => {
        const repo = new AlertRepository(ctx.db);
        return repo.findAffectedActiveAlerts(input);
    }),
    // onActiveChange: publicProcedure
    //     .input(entitySelectionQuery)
    //     .subscription(async function* ({ input, signal }) {
    //         yield input; // TODO
    //     }),
});
