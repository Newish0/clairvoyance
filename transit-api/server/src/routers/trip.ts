import { TripInstancesRepository } from "../repositories/trip-instance-repository";
import { publicProcedure, router } from "../trpc";
import * as v from "valibot";
import { Direction } from "../../../../gtfs-processor/shared/gtfs-db-types";

export const tripRouter = router({
    getById: publicProcedure.input(v.string()).query(async ({ input: tripInstanceId }) => {
        return tripInstanceId; // TODO
    }),

    getNearby: publicProcedure
        .input(
            v.union([
                v.object({
                    lat: v.number(),
                    lng: v.number(),
                    radius: v.pipe(
                        v.number(),
                        v.minValue(100),
                        v.maxValue(5000),
                        v.description("Radius in meters")
                    ),
                }),
                v.object({
                    lat: v.number(),
                    lng: v.number(),
                    bbox: v.pipe(
                        v.object({
                            minLat: v.number(),
                            maxLat: v.number(),
                            minLng: v.number(),
                            maxLng: v.number(),
                        }),
                        v.check((bbox) => {
                            const latDiff = bbox.maxLat - bbox.minLat;
                            const lngDiff = bbox.maxLng - bbox.minLng;
                            return latDiff <= 0.0301 && lngDiff <= 0.0301; // Account for floating point error
                        }, "Bounding box must not exceed 0.03 degrees in any dimension")
                    ),
                }),
            ])
        )
        .query(async ({ input, ctx }) => {
            const repo = new TripInstancesRepository(ctx.db);
            const data = await repo.findNearbyTrips(input);
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
            const repo = new TripInstancesRepository(ctx.db);
            for await (const trip of repo.watchLivePositions({
                ...input,
                signal,
            })) {
                yield trip;
            }
        }),

    liveTripStopTime: publicProcedure
        .input(
            v.array(
                v.object({
                    tripInstanceId: v.string(),
                    stopId: v.string(),
                })
            )
        )
        .subscription(async function* ({ input, ctx, signal }) {
            const repo = new TripInstancesRepository(ctx.db);
            for await (const trip of repo.watchLiveStopTimes(input, signal)) {
                yield trip;
            }
        }),
});
