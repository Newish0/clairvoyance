import { Direction, RouteType } from "database";
import { AlertRepository } from "../repositories/alert-repository";
import { publicProcedure, router } from "../trpc";
import * as v from "valibot";
import { vInteger } from "../validations/helpers";

const entitySelectionQuery = v.object({
    agencyId: v.optional(vInteger()),
    routeType: v.optional(v.enum(RouteType)),
    routeId: v.optional(vInteger()),
    direction: v.optional(v.enum(Direction)),
    stopId: v.optional(v.union([vInteger(), v.array(vInteger())])),
    tripInstanceId: v.optional(vInteger()),
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
