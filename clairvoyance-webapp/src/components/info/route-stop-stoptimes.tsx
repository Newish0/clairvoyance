import { createEffect, createResource, For, Show, type Component } from "solid-js";
import { getRouteStopTimes } from "~/services/gtfs/stop_times";
import { Carousel, CarouselContent, CarouselItem } from "../ui/carousel";
import { Card, CardContent } from "../ui/card";
import { decomposeTime, getArrivalMinutes, hhmmssToString } from "~/utils/time";
import { ChevronRight, Triangle, TriangleRight } from "lucide-solid";
import { cn } from "~/lib/utils";
import RealTimeIndicator from "../ui/realtime-indicator";
import OccupancyBadge from "../ui/occupancy-badge";
import { addDays, addHours, format } from "date-fns";
import type { StopTimeResponse } from "tmp-test/solid-trip-details/src/types";
import type { RouteStopTimeResponse } from "~/services/gtfs/types";
import { Separator } from "../ui/separator";
import { buttonVariants } from "../ui/button";
import { WheelGesturesPlugin } from "embla-carousel-wheel-gestures";

type RouteStopStopTimesProps = {
    tripId: string;
    routeId: string;
    stopId: string;
};

const RouteStopStopTimes: Component<RouteStopStopTimesProps> = (props) => {
    const [prevDayStopTimes] = createResource(
        () => ({ routeId: props.routeId, stopId: props.stopId }),
        (params) =>
            getRouteStopTimes({
                ...params,
                currentTime: (() => {
                    const { hours, minutes, seconds } = decomposeTime(
                        format(new Date(), "HH:mm:ss")
                    );
                    return hhmmssToString(hours + 24, minutes, seconds);
                })(),
                currentDate: format(addDays(new Date(), -1), "yyyyMMdd"),
            })
    );
    const [todayStopTimes] = createResource(
        () => ({ routeId: props.routeId, stopId: props.stopId }),
        (params) =>
            getRouteStopTimes({
                ...params,
                currentTime: format(new Date(), "HH:mm:ss"),
                currentDate: format(new Date(), "yyyyMMdd"),
            })
    );

    createEffect(() => {
        console.log("Today stop times", todayStopTimes());
        console.log("Prev day stop times", prevDayStopTimes());
    });

    return (
        <div>
            <Carousel plugins={[WheelGesturesPlugin()]}>
                <CarouselContent>
                    <For each={prevDayStopTimes()}>
                        {(stopTime) => (
                            <StopTimeItem
                                routeId={props.routeId}
                                tripId={props.tripId}
                                stopId={props.stopId}
                                stopTime={stopTime}
                            />
                        )}
                    </For>

                    <For each={todayStopTimes()?.slice(0, 3)}>
                        {(stopTime) => (
                            <StopTimeItem
                                routeId={props.routeId}
                                tripId={props.tripId}
                                stopId={props.stopId}
                                stopTime={stopTime}
                            />
                        )}
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

const StopTimeItem: Component<{
    stopTime: RouteStopTimeResponse;
    routeId: string;
    stopId: string;
    tripId: string;
}> = (props) => {
    const arrivalMinutes = getArrivalMinutes(
        props.stopTime.arrival_time,
        props.stopTime.realtime_arrival_delay ?? 0
    );

    return (
        <CarouselItem class="basis-1/2 lg:basis-1/3">
            <div class="p-1">
                <a
                    href={`/routes/${props.routeId}/trips/${props.stopTime.trip_id}/stops/${props.stopId}`}
                >
                    <Card>
                        <CardContent
                            class={cn(
                                "p-2 relative flex flex-col gap-1 items-center justify-between",
                                props.stopTime.trip_id !== props.tripId && "opacity-75"
                            )}
                        >
                            <div
                                class={cn(
                                    props.stopTime.trip_id === props.tripId
                                        ? "font-medium"
                                        : "font-light"
                                )}
                            >
                                {arrivalMinutes} min
                            </div>

                            <div>
                                <OccupancyBadge status="EMPTY" />
                            </div>

                            <Show
                                when={
                                    props.stopTime.realtime_arrival_delay !== undefined
                                        ? props.stopTime.realtime_arrival_delay
                                        : null
                                }
                            >
                                {(delay) => <RealTimeIndicator delay={delay()} />}
                            </Show>
                        </CardContent>
                    </Card>
                </a>
            </div>
        </CarouselItem>
    );
};

export default RouteStopStopTimes;