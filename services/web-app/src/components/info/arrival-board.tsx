import { useStore } from "@nanostores/solid";
import { type Component, createResource, For, onCleanup, onMount } from "solid-js";
import { getNearbyTrips } from "~/services/trips";
import { $userLocation } from "~/stores/user-location-store";
import { ArrivalRow } from "./arrival-row";

import { debounce } from "@solid-primitives/scheduled";

const DEFAULT_CLOCK_UPDATE_INTERVAL = 2000; // 2 seconds
const DEFAULT_REFETCH_INTERVAL = 60 * 1000; // 1 minute

export const ArrivalBoard: Component = () => {
    const userLocation = useStore($userLocation);
    const [nearbyTrips, { refetch: refetchNearbyTrips, mutate: setNearbyTrips }] = createResource(
        // NOTE: Must explicitly specify each object field to get update to work
        () => ({
            lat: userLocation().current.lat,
            lon: userLocation().current.lon,
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
            <For each={Object.entries(nearbyTrips() || {})}>
                {([_, trips]) => (
                    <ArrivalRow
                        entries={trips.map((trip) => ({
                            routeId: trip.route_id,
                            stopId: trip.stop_time.stop_id,
                            routeShortName: trip.route_short_name,
                            tripObjectId: trip._id, // NOTE: Requires Mongo Object ID b/c this is ScheduledTrip
                            stopName: trip.stop_name,
                            tripHeadsign: trip.trip_headsign,
                            predictedArrivalTime: trip.realtime_stop_updates
                                ? new Date(trip.realtime_stop_updates.predicted_arrival_time)
                                : undefined,
                            scheduledArrivalTime: new Date(trip.stop_time.arrival_datetime),
                        }))}
                    />
                )}
            </For>
        </div>
    );
};
