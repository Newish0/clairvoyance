import { addHours, differenceInMinutes, differenceInSeconds, set, type DateArg } from "date-fns";
import { WheelGesturesPlugin } from "embla-carousel-wheel-gestures";
import {
    createEffect,
    createResource,
    createSignal,
    For,
    onCleanup,
    onMount,
    Show,
    type Accessor,
    type Component,
} from "solid-js";
import { cn } from "~/lib/utils";
import { getRouteNextTripsAtStop } from "~/services/trips";
import { buttonVariants } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Carousel, CarouselContent, CarouselItem } from "../ui/carousel";
import OccupancyBadge from "../ui/occupancy-badge";
import RealTimeIndicator from "../ui/realtime-indicator";

const DEFAULT_CLOCK_UPDATE_INTERVAL = 2000; // 2 seconds
const DEFAULT_REFETCH_INTERVAL = 60 * 1000; // 1 minute

type StopNextTripsProps = {
    directionId: string;
    routeId: string;
    stopId: string;
    viewingTrip?: Accessor<any>;
    refetchViewingTrip?: () => void;
    clockUpdateInterval?: number;
    refetchInterval?: number;
};

const StopNextTrips: Component<StopNextTripsProps> = (props) => {
    const [viewingTrip, setViewingTrip] = createSignal<any>(props.viewingTrip());
    const [stopNextTrips, { refetch: refetchStopNextTrips, mutate: setStopNextTrips }] =
        createResource(async () => {
            return await getRouteNextTripsAtStop({
                directionId: props.directionId as "0" | "1",
                routeId: props.routeId,
                stopId: props.stopId,
                endDatetime: addHours(new Date(), 4),
            });
        });

    let refetchInterval: null | ReturnType<typeof setInterval> = null;
    let clockInterval: null | ReturnType<typeof setInterval> = null;
    onMount(() => {
        refetchInterval = setInterval(() => {
            refetchStopNextTrips();
            props.refetchViewingTrip?.();
        }, props.refetchInterval ?? DEFAULT_REFETCH_INTERVAL);

        clockInterval = setInterval(() => {
            setStopNextTrips(stopNextTrips()); // force re-render
            setViewingTrip(viewingTrip()); // force re-render
        }, props.clockUpdateInterval ?? DEFAULT_CLOCK_UPDATE_INTERVAL);
    });

    onCleanup(() => {
        if (refetchInterval) clearInterval(refetchInterval);
        if (clockInterval) clearInterval(clockInterval);
    });

    createEffect(() => {
        setViewingTrip(props.viewingTrip());
    });

    return (
        <div>
            <Carousel plugins={[WheelGesturesPlugin()]}>
                <CarouselContent>
                    <Show
                        when={
                            viewingTrip() &&
                            stopNextTrips()?.every((t) => t._id != viewingTrip()._id)
                                ? viewingTrip()
                                : null
                        }
                    >
                        {(trip) => {
                            const stop = trip().scheduled_stop_times.find(
                                (st) => st.stop_id == props.stopId
                            );

                            return (
                                <TripOptionItem
                                    routeId={props.routeId}
                                    stopId={props.stopId}
                                    tripObjectId={trip()._id}
                                    scheduledArrivalDatetime={stop?.arrival_datetime}
                                    predictedArrivalDatetime={
                                        trip()?.realtime_stop_updates[stop.stop_sequence]
                                            ?.predicted_arrival_time
                                    }
                                    viewingTripObjectId={trip()._id}
                                    hasLeft={trip().current_stop_sequence > stop.stop_sequence}
                                />
                            );
                        }}
                    </Show>

                    <For each={stopNextTrips()}>
                        {(trip) => {
                            const stop = trip.scheduled_stop_times.find(
                                (st) => st.stop_id == props.stopId
                            );

                            return (
                                <TripOptionItem
                                    routeId={props.routeId}
                                    stopId={props.stopId}
                                    tripObjectId={trip._id}
                                    scheduledArrivalDatetime={stop?.arrival_datetime}
                                    predictedArrivalDatetime={
                                        trip?.realtime_stop_updates[stop.stop_sequence]
                                            ?.predicted_arrival_time
                                    }
                                    viewingTripObjectId={viewingTrip()?._id}
                                    hasLeft={trip.current_stop_sequence > stop.stop_sequence}
                                />
                            );
                        }}
                    </For>

                    <CarouselItem class="basis-1/2 lg:basis-1/3">
                        <div class="p-1">
                            <Card>
                                <CardContent
                                    class={cn(
                                        "p-2 relative flex flex-col gap-1 items-center justify-between"
                                    )}
                                >
                                    <a
                                        class={buttonVariants({
                                            variant: "link",
                                        })}
                                    >
                                        Show more
                                    </a>
                                </CardContent>
                            </Card>
                        </div>
                    </CarouselItem>
                </CarouselContent>
            </Carousel>
        </div>
    );
};

const TripOptionItem: Component<{
    routeId: string;
    stopId: string;
    viewingTripObjectId?: string;
    tripObjectId: string;
    predictedArrivalDatetime?: DateArg<Date>;
    scheduledArrivalDatetime: DateArg<Date>;
    hasLeft?: boolean;
}> = (props) => {
    const arrivalMinutes = () =>
        differenceInMinutes(
            props.predictedArrivalDatetime || props.scheduledArrivalDatetime,
            new Date()
        );

    const delaySeconds = (): number | null =>
        props.predictedArrivalDatetime
            ? differenceInSeconds(props.predictedArrivalDatetime, props.scheduledArrivalDatetime)
            : null;

    const curViewing = () => props.viewingTripObjectId === props.tripObjectId;

    const etaMsg = () =>
        props.hasLeft ? (
            <span class="text-xs">Left {-arrivalMinutes()} min ago</span>
        ) : (
            <span>{arrivalMinutes()} min</span>
        );

    return (
        <CarouselItem class="basis-1/2 lg:basis-1/3">
            <div class="p-1">
                <a
                    href={`${import.meta.env.BASE_URL}routes/${props.routeId}/trips/${
                        props.tripObjectId
                    }/stops/${props.stopId}`}
                >
                    <Card>
                        <CardContent
                            class={cn(
                                "p-2 relative flex flex-col gap-1 items-center justify-between",
                                !curViewing() && "opacity-75"
                            )}
                        >
                            <div class={cn(curViewing() ? "font-medium" : "font-light")}>
                                {etaMsg()}
                            </div>

                            <div>
                                <OccupancyBadge status="EMPTY" size={10} />
                            </div>

                            <Show when={delaySeconds() !== null ? delaySeconds() : undefined}>
                                {(delay) => <RealTimeIndicator delay={delay()} />}
                            </Show>
                        </CardContent>
                    </Card>
                </a>
            </div>
        </CarouselItem>
    );
};

export default StopNextTrips;
