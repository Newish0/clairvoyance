import { createResource, For, Show, type Component } from "solid-js";
import { getRouteStopTimes } from "~/services/gtfs/stop_times";
import { Carousel, CarouselContent, CarouselItem } from "../ui/carousel";
import { Card, CardContent } from "../ui/card";
import { getArrivalMinutes } from "~/utils/time";
import { ChevronRight, Triangle, TriangleRight } from "lucide-solid";
import { cn } from "~/lib/utils";
import RealTimeIndicator from "../ui/realtime-indicator";
import OccupancyBadge from "../ui/occupancy-badge";

type RouteStopStopTimesProps = {
    tripId: string;
    routeId: string;
    stopId: string;
};

const RouteStopStopTimes: Component<RouteStopStopTimesProps> = (props) => {
    const [stopTimes] = createResource(
        () => ({ routeId: props.routeId, stopId: props.stopId }),
        (params) => getRouteStopTimes({ ...params })
    );

    return (
        <div>
            <Carousel>
                <CarouselContent>
                    <For each={stopTimes()}>
                        {(stopTime) => {
                            const arrivalMinutes = getArrivalMinutes(
                                stopTime.arrival_time,
                                stopTime.realtime_arrival_delay ?? 0
                            );

                            return (
                                <CarouselItem class="basis-1/2 lg:basis-1/3">
                                    <div class="p-1">
                                        <a
                                            href={`/routes/${props.routeId}/trips/${stopTime.trip_id}/stops/${props.stopId}`}
                                        >
                                            <Card>
                                                <CardContent
                                                    class={cn(
                                                        "p-2 relative flex flex-col gap-1 items-center justify-between",
                                                        stopTime.trip_id !== props.tripId &&
                                                            "opacity-75"
                                                    )}
                                                >
                                                    <div
                                                        class={cn(
                                                            stopTime.trip_id === props.tripId
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
                                                            stopTime.realtime_arrival_delay !==
                                                            undefined
                                                                ? stopTime.realtime_arrival_delay
                                                                : null
                                                        }
                                                    >
                                                        {(delay) => (
                                                            <RealTimeIndicator delay={delay()} />
                                                        )}
                                                    </Show>
                                                </CardContent>
                                            </Card>
                                        </a>
                                    </div>
                                </CarouselItem>
                            );
                        }}
                    </For>
                </CarouselContent>
            </Carousel>
        </div>
    );
};

export default RouteStopStopTimes;
