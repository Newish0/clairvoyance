import { createResource, For, mergeProps, onCleanup, onMount, Show } from "solid-js";
import { TransitRouteTimeline } from "~/components/ui/transit-timeline";
import { Badge } from "../ui/badge";

import { addHours, format } from "date-fns";
import { ArrowLeftRightIcon, CircleMinusIcon, WifiHighIcon } from "lucide-solid";
import { getRouteNextTripsAtStop, getScheduledTripDetails } from "~/services/trips";
import { recordToSearchParams } from "~/utils/urls";
import { buttonVariants } from "../ui/button";
import StopNextTrips from "./stop-next-trips";

import { StopTimeUpdateScheduleRelationship } from "gtfs-db-types";
import { cn } from "~/lib/utils";
import { getAnyActiveAlertsByEntitySelector } from "~/services/alerts";
import { Carousel, CarouselContent, CarouselItem } from "../ui/carousel";
import TransitAlert from "../ui/transit-alert";

interface TripDetailsProps {
    tripObjectId: string;
    routeId: string;
    stopId: string;
    altRouteId?: string;
    altStopId?: string;
    refetchInterval?: number;
    clockUpdateInterval?: number;
}

const DEFAULT_CLOCK_UPDATE_INTERVAL = 2000; // 2 seconds
const DEFAULT_REFETCH_INTERVAL = 60 * 1000; // 1 minute

const TripDetails = (props: TripDetailsProps) => {
    const finalProps = mergeProps(
        {
            refetchInterval: DEFAULT_REFETCH_INTERVAL,
            clockUpdateInterval: DEFAULT_CLOCK_UPDATE_INTERVAL,
        },
        props
    );

    const [ourTrip, { refetch: refetchOurTrip, mutate: setOurTrip }] = createResource(async () => {
        return await getScheduledTripDetails(finalProps.tripObjectId);
    });

    const [stopNextTrips, { refetch: refetchStopNextTrips, mutate: setStopNextTrips }] =
        createResource(
            () => ({
                directionId: ourTrip()?.direction_id as 0 | 1 | undefined,
                routeId: finalProps.routeId,
                stopId: finalProps.stopId,
                endDatetime:
                    ourTrip()?.stop_times.find((st) => st.stop_id == finalProps.stopId)
                        ?.departure_datetime ?? addHours(new Date(), 4),
                limit: 3,
            }),
            async (params) => {
                return await getRouteNextTripsAtStop(params);
            }
        );

    const [activeAlertData] = createResource(
        () => ({
            directionId: ourTrip()?.direction_id as 0 | 1 | undefined,
            routeId: finalProps.routeId,

            tripId: ourTrip()?.trip_id,
            startDate: ourTrip()?.start_date,
            startTime: ourTrip()?.start_time,

            stopIds: ourTrip()?.stop_times.map((st) => st.stop_id),
        }),
        async (params) => getAnyActiveAlertsByEntitySelector(params)
    );

    let refetchInterval: null | ReturnType<typeof setInterval> = null;
    let clockInterval: null | ReturnType<typeof setInterval> = null;
    onMount(() => {
        refetchInterval = setInterval(() => {
            refetchStopNextTrips();
            refetchOurTrip();
        }, finalProps.refetchInterval);

        // force re-render to update ETA
        clockInterval = setInterval(() => {
            setStopNextTrips(stopNextTrips());
            setOurTrip(ourTrip());
        }, finalProps.clockUpdateInterval);
    });

    onCleanup(() => {
        if (refetchInterval) clearInterval(refetchInterval);
        if (clockInterval) clearInterval(clockInterval);
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
                                        trip().stop_times.find((s) => s.stop_id === props.stopId)
                                            ?.stop_name
                                    }
                                </p>
                            </div>
                        </>
                    )}
                </Show>
            </div>

            <div>
                <Show when={stopNextTrips()}>
                    {(stopNextTrips) => (
                        <StopNextTrips
                            routeId={props.routeId}
                            stopId={props.stopId}
                            viewingTrip={ourTrip()}
                            stopNextTrips={stopNextTrips()}
                            alt={{
                                routeId: props.altRouteId,
                                stopId: props.altStopId,
                            }}
                        />
                    )}
                </Show>
            </div>

            <div>
                <Carousel>
                    <CarouselContent>
                        <For each={activeAlertData()?.alerts}>
                            {(alert) => (
                                <CarouselItem
                                    class={cn(
                                        activeAlertData()?.alerts.length > 1
                                            ? "basis-5/6"
                                            : "basis-full"
                                    )}
                                >
                                    <TransitAlert
                                        alert={alert}
                                        stopNames={activeAlertData()?.lookup.stop_names}
                                    />
                                </CarouselItem>
                            )}
                        </For>
                    </CarouselContent>
                </Carousel>
            </div>

            <Show when={ourTrip()}>
                {(trip) => (
                    <div class="max-h overflow-auto">
                        <TransitRouteTimeline
                            stops={trip().stop_times.map((s) => {
                                const stopSkipped =
                                    s.schedule_relationship ===
                                    StopTimeUpdateScheduleRelationship.SKIPPED;

                                const stopName = () =>
                                    stopSkipped ? (
                                        <>
                                            {" "}
                                            <s>{s.stop_name}</s>
                                            <Show when={import.meta.env.DEV}>
                                                <div class="text-xs text-muted-foreground font-mono">
                                                    StopID: {s.stop_id}
                                                </div>
                                            </Show>
                                        </>
                                    ) : (
                                        <>
                                            {s.stop_name}
                                            <Show when={import.meta.env.DEV}>
                                                <div class="text-xs text-muted-foreground font-mono">
                                                    StopID: {s.stop_id}
                                                </div>
                                            </Show>
                                        </>
                                    );

                                const stopTime = () => {
                                    if (stopSkipped) {
                                        return (
                                            <div class="flex items-center gap-2">
                                                <span class="w-16 text-right">Closed</span>
                                                <CircleMinusIcon size={16} />
                                            </div>
                                        );
                                    } else if (s.predicted_arrival_datetime) {
                                        return (
                                            <div class="flex items-center gap-2">
                                                <span class="w-16 text-right">
                                                    {format(s.predicted_arrival_datetime, "p")}
                                                </span>

                                                <div class="h-6 rotate-45">
                                                    <WifiHighIcon size={16} class="animate-pulse" />
                                                </div>
                                            </div>
                                        );
                                    }
                                    return format(s.arrival_datetime, "p");
                                };

                                return {
                                    stopName: stopName(),
                                    stopTime: stopTime(),
                                };
                            })}
                            activeStop={
                                trip().stop_times.findIndex((s) => s.stop_id === props.stopId) ?? -1
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
