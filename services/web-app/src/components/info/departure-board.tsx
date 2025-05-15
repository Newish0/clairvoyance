import { type Component, createResource, For, onCleanup, onMount, Suspense } from "solid-js";
import { getNearbyTrips } from "~/services/trips";

import { DepartureRow } from "./departure-row";

import { debounce } from "@solid-primitives/scheduled";
import { Skeleton } from "../ui/skeleton";
import { useStore } from "@nanostores/solid";
import { $selectedUserLocation } from "~/stores/selected-location-store";

const DEFAULT_CLOCK_UPDATE_INTERVAL = 2000; // 2 seconds
const DEFAULT_REFETCH_INTERVAL = 60 * 1000; // 1 minute

export const DepartureBoard: Component = () => {
    const selectedLocation = useStore($selectedUserLocation);
    const [nearbyTrips, { refetch: refetchNearbyTrips, mutate: setNearbyTrips }] = createResource(
        // NOTE: Must explicitly specify each object field to get update to work
        () => ({
            lat: selectedLocation().latitude,
            lon: selectedLocation().longitude,
        }),
        (currentLoc) => {
            return new Promise<Awaited<ReturnType<typeof getNearbyTrips>>>((resolve, reject) => {
                const scheduled = debounce(
                    () =>
                        getNearbyTrips({
                            latitude: currentLoc.lat,
                            longitude: currentLoc.lon,
                            radius: 1000,
                        })
                            .then(resolve)
                            .catch(reject),
                    250
                );

                scheduled();
            });
        }
    );

    let clockUpdateInterval: null | ReturnType<typeof setInterval> = null;
    let refetchInterval: null | ReturnType<typeof setInterval> = null;

    onMount(() => {
        clockUpdateInterval = setInterval(() => {
            setNearbyTrips(nearbyTrips());
        }, DEFAULT_CLOCK_UPDATE_INTERVAL);

        refetchInterval = setInterval(() => {
            refetchNearbyTrips();
        }, DEFAULT_REFETCH_INTERVAL);
    });

    onCleanup(() => {
        if (clockUpdateInterval) clearInterval(clockUpdateInterval);
        if (refetchInterval) clearInterval(refetchInterval);
    });

    return (
        <div class="w-full mx-auto space-y-2">
            <Suspense fallback={<DepartureBoardSkeleton />}>
                <For each={Object.entries(nearbyTrips() || {})}>
                    {([_, trips]) => (
                        <DepartureRow
                            entries={trips.map((trip, i) => ({
                                routeId: trip.route_id,
                                stopId: trip.stop_time.stop_id,
                                routeShortName: trip.route_short_name,
                                tripObjectId: trip._id, // NOTE: Requires Mongo Object ID b/c this is ScheduledTrip
                                stopName: trip.stop_name,
                                tripHeadsign: trip.trip_headsign,
                                predictedDepartureTime: trip.realtime_stop_updates
                                    ? new Date(trip.realtime_stop_updates.predicted_departure_time)
                                    : undefined,
                                scheduledDepartureTime: new Date(trip.stop_time.departure_datetime),
                                ...(trips.length > 1
                                    ? {
                                          alt: {
                                              routeId: trips.at((i + 1) % trips.length)?.route_id,
                                              stopId: trips.at((i + 1) % trips.length)?.stop_time
                                                  .stop_id,
                                          },
                                      }
                                    : {}),
                            }))}
                        />
                    )}
                </For>
            </Suspense>
        </div>
    );
};

const DepartureBoardSkeleton: Component = () => (
    <>
        <For each={new Array(5).fill(0)}>
            {() => <Skeleton height={98} radius={5} class="w-full" />}
        </For>
    </>
);
