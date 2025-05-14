import { addHours, differenceInMinutes, differenceInSeconds, type DateArg } from "date-fns";
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
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "../ui/carousel";
import OccupancyBadge, { OccupancyStatus } from "../ui/occupancy-badge";
import RealTimeIndicator from "../ui/realtime-indicator";

import { Sheet, SheetContent, SheetTrigger } from "~/components/ui/sheet";
import { Badge } from "../ui/badge";
import { Separator } from "../ui/separator";
import RouteStopSchedule from "./route-stop-schedule";

type StopNextTripsProps = {
    routeId: string;
    stopId: string;
    stopNextTrips: ScheduledTrip[];
    viewingTrip?: ScheduledTrip;
};

type ScheduledTrip = any; // TODO: use real type

const StopNextTrips: Component<StopNextTripsProps> = (props) => {
    const [api, setApi] = createSignal<ReturnType<CarouselApi>>();

    const viewingTrip = () => props.viewingTrip;
    const stopNextTrips = () => props.stopNextTrips;
    const directionId = () =>
        props.stopNextTrips[0]?.direction_id ?? props.viewingTrip?.direction_id ?? "0";

    const nextTrips: Accessor<(ScheduledTrip | "separator")[]> = () => {
        // If there is a viewing trip and it's not in the list, add it.
        if (viewingTrip() && stopNextTrips()?.every((t) => t._id != viewingTrip()._id)) {
            const sortedTrips = [viewingTrip(), ...stopNextTrips()].toSorted((a, b) => {
                const aDepartureTime = a.scheduled_stop_times.find(
                    (st) => st.stop_id == props.stopId
                )?.departure_datetime;
                const bDepartureTime = b.scheduled_stop_times.find(
                    (st) => st.stop_id == props.stopId
                )?.departure_datetime;
                return aDepartureTime > bDepartureTime ? 1 : -1;
            });
            const indexOfViewingTrip = sortedTrips.findIndex((t) => t._id == viewingTrip()._id);

            // The case where the viewing trip is in the middle of the list is NOT possible.
            // So we don't need to handle it.
            if (indexOfViewingTrip === 0) {
                return [sortedTrips.at(0), "separator", ...sortedTrips.slice(1)];
            } else if (indexOfViewingTrip === sortedTrips.length - 1) {
                return [...sortedTrips.slice(0, -1), "separator", sortedTrips.at(-1)];
            }
        } else {
            return stopNextTrips();
        }
    };

    createEffect(() => {
        if (!viewingTrip() || !nextTrips()) return;
        const indexOfViewingTrip = nextTrips().findIndex((t) => t._id == viewingTrip()._id);
        setTimeout(() => {
            api().scrollTo(indexOfViewingTrip);
        }, 200);
    });

    return (
        <div>
            <Carousel
                plugins={[WheelGesturesPlugin()]}
                opts={{
                    dragFree: true,
                }}
                setApi={setApi}
            >
                <CarouselContent>
                    <For each={nextTrips()}>
                        {(trip) => (
                            <Show
                                when={trip !== "separator"}
                                fallback={
                                    <div class="flex justify-center items-center gap-1 pl-4 font-semibold">
                                        <Separator orientation="vertical" />
                                        <Separator orientation="vertical" />
                                    </div>
                                }
                            >
                                {(_) => {
                                    const stop = trip.scheduled_stop_times.find(
                                        (st) => st.stop_id == props.stopId
                                    );

                                    return (
                                        <CarouselItem class="basis-1/3 lg:basis-1/4">
                                            <TripOptionItem
                                                routeId={props.routeId}
                                                stopId={props.stopId}
                                                tripObjectId={trip._id}
                                                scheduledDepartureDatetime={
                                                    stop?.departure_datetime
                                                }
                                                predictedDepartureDatetime={
                                                    trip?.realtime_stop_updates[stop.stop_sequence]
                                                        ?.predicted_departure_time
                                                }
                                                viewingTripObjectId={viewingTrip()?._id}
                                                hasLeft={
                                                    trip.current_stop_sequence > stop.stop_sequence
                                                }
                                                occupancyStatus={trip.current_occupancy}
                                            />
                                        </CarouselItem>
                                    );
                                }}
                            </Show>
                        )}
                    </For>

                    <CarouselItem class="basis-1/3 lg:basis-1/4">
                        <div class="p-1">
                            <Card>
                                <CardContent class="p-2 relative flex flex-col gap-1 items-center justify-center h-16">
                                    <Sheet>
                                        <SheetTrigger
                                            as={Button<"button">}
                                            variant="link"
                                            class="h-min"
                                        >
                                            Show more
                                        </SheetTrigger>
                                        <SheetContent position="right" class="flex flex-col w-5/6">
                                            <div class="text-left">
                                                <div class="flex gap-2 items-stretch">
                                                    <Badge class="text-4xl font-bold">
                                                        {viewingTrip()?.route_short_name}
                                                    </Badge>

                                                    <div>
                                                        <h3 class="text-xl font-semibold">
                                                            {viewingTrip()?.trip_headsign}
                                                        </h3>
                                                        <p class="text-sm font-light">
                                                            {
                                                                viewingTrip()?.scheduled_stop_times.find(
                                                                    (s) =>
                                                                        s.stop_id === props.stopId
                                                                ).stop_name
                                                            }
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>

                                            <div class="my-2 overflow-y-auto">
                                                <RouteStopSchedule
                                                    routeId={props.routeId}
                                                    stopId={props.stopId}
                                                    directionId={directionId()}
                                                    curViewingTrip={viewingTrip()}
                                                />
                                            </div>
                                        </SheetContent>
                                    </Sheet>
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
    predictedDepartureDatetime?: DateArg<Date>;
    scheduledDepartureDatetime: DateArg<Date>;
    hasLeft?: boolean;
    occupancyStatus?: number;
}> = (props) => {
    const departureMinutes = () =>
        differenceInMinutes(
            props.predictedDepartureDatetime || props.scheduledDepartureDatetime,
            new Date()
        );

    const delaySeconds = (): number | null =>
        props.predictedDepartureDatetime
            ? differenceInSeconds(
                  props.predictedDepartureDatetime,
                  props.scheduledDepartureDatetime
              )
            : null;

    const curViewing = () => props.viewingTripObjectId === props.tripObjectId;

    const etaMsg = () =>
        props.hasLeft ? (
            <span class="text-xs">Left {-departureMinutes()} min ago</span>
        ) : (
            <span>{departureMinutes()} min</span>
        );

    return (
        <div class="p-1">
            <a
                href={`${import.meta.env.BASE_URL}next-trips/?route=${props.routeId}&stop=${
                    props.stopId
                }&trip=${props.tripObjectId}`}
            >
                <Card>
                    <CardContent
                        class={cn(
                            "p-2 relative flex flex-col gap-1 items-center justify-center text-center leading-none h-16",
                            !curViewing() && "opacity-75"
                        )}
                    >
                        <div class={cn(curViewing() ? "font-medium" : "font-light")}>
                            {etaMsg()}
                        </div>

                        <div>
                            <OccupancyBadge
                                status={
                                    (props.occupancyStatus ??
                                        OccupancyStatus.NO_DATA_AVAILABLE) as OccupancyStatus
                                }
                                size={10}
                            />
                        </div>

                        <Show when={delaySeconds() !== null ? delaySeconds() : undefined}>
                            {(delay) => <RealTimeIndicator delay={delay()} />}
                        </Show>
                    </CardContent>
                </Card>
            </a>
        </div>
    );
};

export default StopNextTrips;
