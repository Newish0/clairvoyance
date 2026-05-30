import { RouteRepository } from "../repositories/route-repository";
import { publicProcedure, router } from "../trpc";
import { vInteger } from "../validations/helpers";

export const routeRouter = router({
    getById: publicProcedure.input(vInteger()).query(async ({ input: routeId, ctx }) => {
        const repo = new RouteRepository(ctx.db);
        return repo.findById(routeId);
    }),
});
