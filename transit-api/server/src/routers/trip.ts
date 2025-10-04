import { TripInstancesRepository } from "@/repositories/trip-instance-repository";
import { publicProcedure, router } from "../trpc";
import * as v from "valibot";
import { Direction } from "@root/gtfs-processor/shared/gtfs-db-types";

export const tripRouter = router({
    get: publicProcedure.input(v.string()).query(async ({ input: tripInstanceId }) => {
        return tripInstanceId; // TODO
    }),
    getNearby: publicProcedure
        .input(
            v.object({
                lat: v.number(),
                lng: v.number(),
                radius: v.optional(
                    v.pipe(
                        v.number(),
                        v.minValue(100),
                        v.maxValue(5000),
                        v.description("Radius in meters")
                    ),
                    1500
                ),
            })
        )
        .query(async ({ input: { lat, lng, radius }, ctx }) => {
            const repo = new TripInstancesRepository(ctx.db);
            const data = await repo.findNearbyTrips(lat, lng, radius);
            return data;
        }),
    getNext: publicProcedure
        .input(
            v.object({
                agencyId: v.string(),
                routeId: v.string(),
                directionId: v.enum(Direction),
                stopId: v.string(),
                excludedTripInstanceIds: v.optional(v.array(v.string())),
            })
        )
        .query(async ({ input, ctx }) => {
            const trips = await new TripInstancesRepository(ctx.db).findNextAtStop(input);
            return trips;
        }),

    liveTripPositions: publicProcedure
        .input(
            v.object({
                agencyId: v.optional(v.string()),
                routeId: v.optional(v.string()),
                directionId: v.optional(v.enum(Direction)),
                bbox: v.optional(
                    v.object({
                        minLat: v.number(),
                        maxLat: v.number(),
                        minLng: v.number(),
                        maxLng: v.number(),
                    })
                ),
            })
        )
        .subscription(async function* ({ input, ctx, signal }) {
            console.log("liveTripPositions");
            const repo = new TripInstancesRepository(ctx.db);
            for await (const trip of repo.watchLivePositions({
                ...input,
                signal,
            })) {
                yield trip;
            }
        }),
});
