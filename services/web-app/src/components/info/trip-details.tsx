import { createEffect, createResource, Show } from "solid-js";
import { getRouteDetails } from "~/services/gtfs/route";
import { getTripDetails } from "~/services/gtfs/trip";
import { Badge } from "../ui/badge";
import { getTripStops } from "~/services/gtfs/stops";
import { TransitRouteTimeline } from "~/components/ui/transit-timeline";
import { getArrivalMinutes } from "~/utils/time";

import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { RadioIcon, SignalIcon, TriangleAlert, WifiHighIcon } from "lucide-solid";
import { getStopNextTripsByStopId } from "~/services/stops";
import { getScheduledTripDetails } from "~/services/trips";
import StopNextTrips from "./stop-next-trips";
import { format } from "date-fns";

interface TripDetailsProps {
    tripObjectId: string;
    routeId: string;
    stopId: string;
}

const TripDetails = (props: TripDetailsProps) => {
    const [ourTrip] = createResource(async () => {
        return await getScheduledTripDetails(props.tripObjectId);
    });

    return (
        <div class="h-full flex flex-col gap-3">
            <div class="flex items-center space-x-2">
                <Show when={ourTrip()}>
                    {(trip) => (
                        <Badge variant="secondary" class="text-sm font-bold">
                            {trip().route_short_name}
                        </Badge>
                    )}
                </Show>
                <div>
                    <Show when={ourTrip()}>
                        {(trip) => <h4 class="font-semibold truncate">{trip().trip_headsign}</h4>}
                    </Show>

                    <Show when={ourTrip()}>
                        {(trip) => (
                            <p class="text-xs text-muted-foreground truncate">
                                At{" "}
                                {
                                    trip().scheduled_stop_times.find(
                                        (s) => s.stop_id === props.stopId
                                    )?.stop_name
                                }
                            </p>
                        )}
                    </Show>
                </div>
            </div>

            <div>
                <Show when={ourTrip()}>
                    {(viewingTrip) => (
                        <StopNextTrips
                            routeId={props.routeId}
                            directionId={viewingTrip().direction_id}
                            stopId={props.stopId}
                            viewingTrip={viewingTrip()}
                        />
                    )}
                </Show>
            </div>

            <div>
                {/* PLACEHOLDERS */}
                <Alert>
                    <TriangleAlert />
                    <AlertTitle>Alert Placeholder</AlertTitle>
                    <AlertDescription>Some alert on this route.</AlertDescription>
                </Alert>
            </div>

            <Show when={ourTrip()}>
                {(trip) => (
                    <div class="max-h overflow-auto">
                        <TransitRouteTimeline
                            stops={trip().scheduled_stop_times.map((s) => ({
                                // TODO: Use stop name
                                // stopName: s.stop_name,
                                stopName: s.stop_name,
                                stopTime: trip().realtime_stop_updates[s.stop_sequence] ? (
                                    <div class="flex items-center">
                                        <span>
                                            {format(
                                                trip().realtime_stop_updates[s.stop_sequence]
                                                    .predicted_arrival_time,
                                                "HH:mm:ss"
                                            )}
                                        </span>

                                        <div class="relative h-6 rotate-45">
                                            <WifiHighIcon size={16} class="animate-pulse" />
                                        </div>
                                    </div>
                                ) : (
                                    format(new Date(s.arrival_datetime), "HH:mm:ss")
                                ),
                            }))}
                            activeStop={
                                trip().scheduled_stop_times.findIndex(
                                    (s) => s.stop_id === props.stopId
                                ) ?? -1
                            }
                        />
                        <div class="h-5/6">{/* Empty space */}</div>
                    </div>
                )}
            </Show>
        </div>
    );
};

export default TripDetails;
