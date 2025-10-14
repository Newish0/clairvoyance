import { RouteRepository } from "../repositories/route-repository";
import { publicProcedure, router } from "../trpc";
import * as v from "valibot";

export const routeRouter = router({
    getById: publicProcedure.input(v.string()).query(async ({ input: routeId, ctx }) => {
        const repo = new RouteRepository(ctx.db);
        return repo.findById(routeId);
    }),
});
