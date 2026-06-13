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
    stopId: v.optional(vInteger()),
    tripInstanceId: v.optional(vInteger()),
});

export const alertRouter = router({
    getActivesForEntity: publicProcedure
        .input(entitySelectionQuery)
        .query(async ({ input, ctx }) => {
            const repo = new AlertRepository(ctx.db);
            return repo.findAlertsForEntity(input);
        }),
    // onActiveChange: publicProcedure
    //     .input(entitySelectionQuery)
    //     .subscription(async function* ({ input, signal }) {
    //         yield input; // TODO
    //     }),
});
