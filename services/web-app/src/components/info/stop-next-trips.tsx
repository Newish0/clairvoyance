import { differenceInMinutes, differenceInSeconds, type DateArg } from "date-fns";
import { WheelGesturesPlugin } from "embla-carousel-wheel-gestures";
import { createEffect, createSignal, For, Show, type Accessor, type Component } from "solid-js";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "../ui/carousel";
import OccupancyBadge from "../ui/occupancy-badge";
import RealTimeIndicator from "../ui/realtime-indicator";

import { MapPin } from "lucide-solid";
import { Sheet, SheetContent, SheetTrigger } from "~/components/ui/sheet";
import { Badge } from "../ui/badge";
import { Separator } from "../ui/separator";
import RouteStopSchedule from "./route-stop-schedule";

import {
    OccupancyStatus,
    TripDescriptorScheduleRelationship,
    type ScheduledTripDocument,
} from "gtfs-db-types";
import type { ScheduledTripDocumentWithStopName } from "~/services/dtos";

type StopNextTripsProps = {
    routeId: string;
    stopId: string;
    stopNextTrips: ScheduledTripDocumentWithStopName[];
    viewingTrip?: ScheduledTripDocumentWithStopName;
};

const StopNextTrips: Component<StopNextTripsProps> = (props) => {
    const [api, setApi] = createSignal<ReturnType<CarouselApi>>();

    const viewingTrip = () => props.viewingTrip;
    const stopNextTrips = () => props.stopNextTrips;
    const directionId = () =>
        props.stopNextTrips[0]?.direction_id ?? props.viewingTrip?.direction_id ?? "0";

    const nextTrips: Accessor<(ScheduledTripDocument | "separator")[]> = () => {
        // If there is a viewing trip and it's not in the list, add it.
        if (viewingTrip() && stopNextTrips()?.every((t) => t._id != viewingTrip()._id)) {
            const sortedTrips = [viewingTrip(), ...stopNextTrips()].toSorted((a, b) => {
                const aDepartureTime = a.stop_times.find(
                    (st) => st.stop_id == props.stopId
                )?.departure_datetime;
                const bDepartureTime = b.stop_times.find(
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
        const indexOfViewingTrip = nextTrips().findIndex(
            (t) => t !== "separator" && t._id == viewingTrip()._id
        );
        setTimeout(() => {
            api().scrollTo(indexOfViewingTrip);
        }, 200);

        console.log(nextTrips().find((t: any) => t._id == viewingTrip()._id));
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
                                when={trip !== "separator" && trip}
                                fallback={
                                    <div class="flex justify-center items-center gap-1 pl-4 font-semibold">
                                        <Separator orientation="vertical" />
                                        <Separator orientation="vertical" />
                                    </div>
                                }
                            >
                                {(trip) => {
                                    const stop = trip().stop_times.find(
                                        (st) => st.stop_id == props.stopId
                                    );

                                    return (
                                        <CarouselItem class="basis-1/3 lg:basis-1/4">
                                            <TripOptionItem
                                                routeId={props.routeId}
                                                stopId={props.stopId}
                                                tripObjectId={trip()._id}
                                                scheduledDepartureDatetime={stop.departure_datetime}
                                                predictedDepartureDatetime={
                                                    stop.predicted_departure_datetime
                                                }
                                                viewingTripObjectId={viewingTrip()?._id}
                                                hasLeft={
                                                    trip().current_stop_sequence >
                                                    stop.stop_sequence
                                                }
                                                occupancyStatus={trip().current_occupancy}
                                                isCancelled={
                                                    trip().schedule_relationship ===
                                                    TripDescriptorScheduleRelationship.CANCELED
                                                }
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
                                        <SheetContent
                                            position="right"
                                            class="flex flex-col gap-2 w-5/6 p-0"
                                        >
                                            <div class="bg-primary p-4 text-primary-foreground text-left">
                                                <div class="flex gap-2 items-stretch">
                                                    <Badge
                                                        class="text-4xl font-bold"
                                                        variant="secondary"
                                                    >
                                                        {viewingTrip()?.route_short_name}
                                                    </Badge>

                                                    <div>
                                                        <h3 class="text-xl font-semibold">
                                                            {viewingTrip()?.trip_headsign}
                                                        </h3>
                                                        <p class="text-sm font-light flex items-center gap-1 mt-1 ">
                                                            <MapPin class="h-4 w-4" />
                                                            {
                                                                viewingTrip()?.stop_times.find(
                                                                    (s) =>
                                                                        s.stop_id === props.stopId
                                                                ).stop_name
                                                            }
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>

                                            <div class="px-4 overflow-y-auto">
                                                <RouteStopSchedule
                                                    routeId={props.routeId}
                                                    stopId={props.stopId}
                                                    directionId={directionId().toString()}
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
    occupancyStatus?: OccupancyStatus;
    isCancelled?: boolean;
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
                        <div
                            class={cn(
                                curViewing() ? "font-medium" : "font-light",
                                props.isCancelled ? "line-through text-muted-foreground" : ""
                            )}
                        >
                            {etaMsg()}
                        </div>

                        <div>
                            <OccupancyBadge
                                status={props.occupancyStatus ?? OccupancyStatus.NO_DATA_AVAILABLE}
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
