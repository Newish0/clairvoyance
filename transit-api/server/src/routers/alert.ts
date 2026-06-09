import { directionEnum, routeTypeEnum } from "database";
import { AlertRepository } from "../repositories/alert-repository";
import { publicProcedure, router } from "../trpc";
import * as v from "valibot";
import { vInteger } from "../validations/helpers";

const entitySelectionQuery = v.object({
    agencyId: v.optional(v.string()),
    routeType: v.optional(v.picklist(routeTypeEnum.enumValues)),
    routeId: v.optional(vInteger()),
    direction: v.optional(v.picklist(directionEnum.enumValues)),
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
