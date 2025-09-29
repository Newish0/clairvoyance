import { type Component, For, Suspense } from "solid-js";

import { DepartureRow } from "./departure-row";

import { TripDescriptorScheduleRelationship } from "gtfs-db-types";
import { selectedLocation } from "~/hooks/use-map-location";
import { useNearbyTrips } from "~/hooks/use-nearby-trips";
import { Skeleton } from "../ui/skeleton";

const DEFAULT_CLOCK_UPDATE_INTERVAL = 2000; // 2 seconds
const DEFAULT_REFETCH_INTERVAL = 60 * 1000; // 1 minute
const DEFAULT_LOCATION_CHANGE_THROTTLE = 10 * 1000; // 10 seconds
const DEFAULT_LOCATION_CHANGE_DEBOUNCE = 250; // 0.25 seconds

export const DepartureBoard: Component = () => {
    const nearbyTrips = useNearbyTrips(
        () => ({
            latitude: selectedLocation()?.lat,
            longitude: selectedLocation()?.lng,
            radius: 1000,
            isAttached: selectedLocation()?.isAttached,
        }),
        {
            changeDebounce: DEFAULT_LOCATION_CHANGE_DEBOUNCE,
            changeThrottle: DEFAULT_LOCATION_CHANGE_THROTTLE,
            refetchInterval: DEFAULT_REFETCH_INTERVAL,
            clockUpdateInterval: DEFAULT_CLOCK_UPDATE_INTERVAL,
        }
    );

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
                                predictedDepartureTime: trip.stop_time.predicted_departure_datetime,
                                scheduledDepartureTime: trip.stop_time.departure_datetime,
                                isCancelled:
                                    trip.schedule_relationship ===
                                    TripDescriptorScheduleRelationship.CANCELED,
                                ...(trips.length > 1
                                    ? {
                                          alt: {
                                              routeId: trips.at((i + 1) % trips.length)?.route_id,
                                              stopId: trips.at((i + 1) % trips.length)?.stop_time
                                                  .stop_id,
                                          },
                                      }
                                    : {}),
                                isLastStop: false, // TODO: Implement on server side
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
