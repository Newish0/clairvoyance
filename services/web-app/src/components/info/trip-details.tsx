import { createEffect, createResource, Show } from "solid-js";
import { getRouteDetails } from "~/services/gtfs/route";
import { getTripDetails } from "~/services/gtfs/trip";
import { Badge } from "../ui/badge";
import { getTripStops } from "~/services/gtfs/stops";
import { TransitRouteTimeline } from "~/components/ui/transit-timeline";
import { getArrivalMinutes } from "~/utils/time";

import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import {
    ArrowLeftRightIcon,
    RadioIcon,
    SignalIcon,
    TriangleAlert,
    WifiHighIcon,
} from "lucide-solid";
import { getStopNextTripsByStopId } from "~/services/stops";
import { getScheduledTripDetails } from "~/services/trips";
import StopNextTrips from "./stop-next-trips";
import { format } from "date-fns";
import { Button, buttonVariants } from "../ui/button";
import { recordToSearchParams } from "~/utils/urls";

interface TripDetailsProps {
    tripObjectId: string;
    routeId: string;
    stopId: string;
    altRouteId?: string;
    altStopId?: string;
}

const TripDetails = (props: TripDetailsProps) => {
    const [ourTrip, { refetch: refetchOurTrip }] = createResource(async () => {
        return await getScheduledTripDetails(props.tripObjectId);
    });

    return (
        <div class="h-full flex flex-col gap-3">
            <div class="flex items-center space-x-2">
                <Show when={ourTrip()}>
                    {(trip) => (
                        <>
                            <Badge variant="secondary" class="text-sm font-bold">
                                {trip().route_short_name}
                            </Badge>

                            <div>
                                <div class="flex items-center gap-2">
                                    <span class="font-semibold truncate">
                                        {trip().trip_headsign}
                                    </span>
                                    <Show when={props.altRouteId && props.altStopId}>
                                        <a
                                            class={buttonVariants({
                                                variant: "ghost",
                                                size: "icon",
                                                class: "h-8 w-8 p-2 rounded-full",
                                            })}
                                            href={`${
                                                import.meta.env.BASE_URL
                                            }next-trips/?${recordToSearchParams({
                                                route: props.altRouteId,
                                                stop: props.altStopId,
                                                alt_route: props.routeId,
                                                alt_stop: props.stopId,
                                            })}`}
                                        >
                                            <ArrowLeftRightIcon size={12} />
                                        </a>
                                    </Show>
                                </div>

                                <p class="text-xs text-muted-foreground truncate">
                                    At{" "}
                                    {
                                        trip().scheduled_stop_times.find(
                                            (s) => s.stop_id === props.stopId
                                        )?.stop_name
                                    }
                                </p>
                            </div>
                        </>
                    )}
                </Show>
            </div>

            <div>
                <Show when={ourTrip()}>
                    {(viewingTrip) => (
                        // TODO: Refactor - make `StopNextTrips` be a dumb component. Move interval logic outside
                        <StopNextTrips
                            routeId={props.routeId}
                            directionId={viewingTrip().direction_id}
                            stopId={props.stopId}
                            viewingTrip={viewingTrip}
                            refetchViewingTrip={refetchOurTrip}
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
                                        <span class="w-16 text-center">
                                            {format(
                                                trip().realtime_stop_updates[s.stop_sequence]
                                                    .predicted_arrival_time,
                                                "p"
                                            )}
                                        </span>

                                        <div class="h-6 rotate-45">
                                            <WifiHighIcon size={16} class="animate-pulse" />
                                        </div>
                                    </div>
                                ) : (
                                    format(new Date(s.arrival_datetime), "p")
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
