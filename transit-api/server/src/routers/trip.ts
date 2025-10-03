import { TripInstancesRepository } from "@/repositories/trip-instance-repository";
import { publicProcedure, router } from "../trpc";
import * as v from "valibot";

export const tripRouter = router({
    get: publicProcedure.input(v.string()).query(async ({ input: tripInstanceId }) => {
        return tripInstanceId; // TODO
    }),
    getNearby: publicProcedure
        .input(
            v.object({
                lat: v.number(),
                lng: v.number(),
                radius: v.pipe(
                    v.number(),
                    v.minValue(100),
                    v.maxValue(5000),
                    v.description("Radius in meters")
                ),
            })
        )
        .query(async ({ input: { lat, lng, radius }, ctx }) => {
            const repo = new TripInstancesRepository(ctx.db);
            const data = await repo.fetchNearbyTrips(lat, lng, radius);
            return data;
        }),
    getNext: publicProcedure
        .input(
            v.object({
                agencyId: v.string(),
                routeId: v.string(),
                directionId: v.string(),
                stopId: v.string(),
                startDatetime: v.date(),
                endDatetime: v.date(),
                excludedTripInstanceIds: v.optional(v.array(v.string())),
            })
        )
        .query(async ({ input }) => {
            return input;
        }),
});
