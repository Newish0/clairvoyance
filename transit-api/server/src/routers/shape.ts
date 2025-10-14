import { ShapeRepository } from "../repositories/shape-repository";
import { publicProcedure, router } from "../trpc";
import * as v from "valibot";
import { EventEmitter, on } from "events";

const ee = new EventEmitter();

setInterval(() => {
    ee.emit("add", { id: "1", name: "John Doe" });
}, 1000);

export const shapeRouter = router({
    getGeoJson: publicProcedure
        .input(
            v.union([
                v.object({
                    agencyId: v.string(),
                    shapeId: v.string(),
                }),
                v.object({
                    shapeObjectId: v.string(),
                }),
            ])
        )
        .query(async ({ input, ctx }) => {
            const shapeRepo = new ShapeRepository(ctx.db);

            if ("shapeObjectId" in input) {
                const geoJson = await shapeRepo.findGeoJsonById(input.shapeObjectId);
                return geoJson;
            }

            const { agencyId, shapeId } = input;
            const geoJson = await shapeRepo.findGeoJson(agencyId, shapeId);
            return geoJson;
        }),

    // testSubscription: publicProcedure.input(v.string()).subscription(async function* (opts) {
    //     for await (const [data] of on(ee, "add", {
    //         // Passing the AbortSignal from the request automatically cancels the event emitter when the request is aborted
    //         signal: opts.signal,
    //     })) {
    //         const post = data as {
    //             id: string;
    //             name: string;
    //         };
    //         yield post;
    //     }
    // }),
});
