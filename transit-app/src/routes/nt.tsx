import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { Direction } from "../../../gtfs-processor/shared/gtfs-db-types";
import {
    ResponsiveModal,
    ResponsiveModalContent,
    ResponsiveModalDescription,
    ResponsiveModalHeader,
    ResponsiveModalTitle,
    ResponsiveModalTrigger,
} from "@/components/ui/responsible-dialog";
import { AppSettings } from "@/components/app-settings";
import { SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TripMap } from "@/components/maps/trip-map";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/main";
import { Badge } from "@/components/ui/badge";
import { useMemo } from "react";
import TransitRouteTimeline from "@/components/trip-info/transit-timeline";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import { differenceInSeconds, format } from "date-fns";
import { DepartureTime } from "@/components/trip-info/depature-time";
import { RealTimeIndicator } from "@/components/ui/realtime-indicator";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const nextTripsSchema = z.object({
    agencyId: z.string(),
    stopId: z.string(),
    routeId: z.string(),
    directionId: z.enum(Direction).optional(),
    tripInstanceId: z.string().optional(),
});

export const Route = createFileRoute("/nt")({
    component: RouteComponent,
    validateSearch: nextTripsSchema,
});

function RouteComponent() {
    const { agencyId, stopId, routeId, directionId, tripInstanceId } = Route.useSearch();

    const { data: tripInstance } = useQuery({
        ...trpc.tripInstance.getFullById.queryOptions(tripInstanceId!),
        enabled: !!tripInstanceId,
        staleTime: 30, // 30 seconds because of realtime data
    });

    const { data: stops } = useQuery({
        ...trpc.stop.getStops.queryOptions({
            agencyId,
            stopId: tripInstance?.stop_times.map((st) => st.stop_id)!,
        }),
        enabled: !!tripInstance,
    });

    const stopsMap = useMemo(
        () => (stops ? new Map(stops.map((stop) => [stop.stop_id, stop])) : null),
        [stops]
    );

    const { data: nextTripInstances } = useQuery({
        ...trpc.tripInstance.getNext.queryOptions({
            agencyId,
            stopId,
            routeId,
            directionId,
            excludedTripInstanceIds: tripInstanceId ? [tripInstanceId] : undefined,
        }),
    });

    if (tripInstance && tripInstance.stop_times.every((st) => st.stop_id !== stopId)) {
        return <div>Invalid stop</div>;
    }

    console.log({ stopId, routeId, directionId });

    const combinedTripInstances = useMemo(() => {
        if (tripInstance) {
            return [tripInstance, ...(nextTripInstances || [])].sort((a, b) => {
                return new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime();
            });
        } else {
            return nextTripInstances || [];
        }
    }, [tripInstance, nextTripInstances]);

    return (
        <div className="h-[100dvh] w-[100dvw] relative">
            <div className="w-full h-full absolute top-0 left-0">
                <TripMap
                    agencyId={tripInstance?.agency_id ?? agencyId}
                    stopIds={tripInstance?.stop_times.map((st) => st.stop_id) ?? []}
                    shapeObjectId={tripInstance?.shape ?? ""}
                />
            </div>

            <ResponsiveModal>
                <ResponsiveModalTrigger asChild>
                    <Button variant={"secondary"} size={"icon"} className="absolute top-4 right-4">
                        <SettingsIcon />
                    </Button>
                </ResponsiveModalTrigger>
                <ResponsiveModalContent className="min-w-1/2 max-w-3xl">
                    <ResponsiveModalHeader>
                        <ResponsiveModalTitle>Settings</ResponsiveModalTitle>
                        <ResponsiveModalDescription>
                            Manage your preferences
                        </ResponsiveModalDescription>
                    </ResponsiveModalHeader>
                    <div className="p-4 overflow-auto">
                        <AppSettings />
                    </div>
                </ResponsiveModalContent>
            </ResponsiveModal>

            <div className="absolute top-[1rem] left-[1rem] max-h-[calc(100dvh-2rem)] w-sm flex flex-col gap-3 overflow-clip p-2 rounded-md bg-primary-foreground/60 backdrop-blur-md">
                {/* Trip info */}
                <div className="flex items-center space-x-2">
                    <Badge
                        variant="secondary"
                        className="text-sm font-bold"
                        style={{
                            backgroundColor: tripInstance?.route?.route_color
                                ? `#${tripInstance.route.route_color}`
                                : undefined,
                            color: tripInstance?.route?.route_text_color
                                ? `#${tripInstance.route.route_text_color}`
                                : undefined,
                        }}
                    >
                        {tripInstance?.route?.route_short_name || "---"}
                    </Badge>

                    <div>
                        <div className="flex items-center gap-2">
                            <span className="font-semibold truncate">
                                {tripInstance?.trip?.trip_headsign || "---"}
                            </span>
                        </div>

                        <p className="text-xs text-muted-foreground truncate">
                            At {stopsMap?.get(stopId)?.stop_name || "---"}
                        </p>
                    </div>
                </div>

                {/* Other trips  */}
                <Carousel
                    opts={{
                        dragFree: true,
                    }}
                >
                    <CarouselContent>
                        {combinedTripInstances?.map((nextTripInstance) => {
                            const stopTime = nextTripInstance.stop_times.find(
                                (st) => st.stop_id === stopId
                            );

                            if (!stopTime) {
                                // Should not get here
                                console.error("Stop time not found");
                                return null;
                            }

                            const lastStopDropOffOnly = !stopTime.departure_datetime;

                            const scheduledTime = lastStopDropOffOnly
                                ? stopTime.arrival_datetime
                                : stopTime.departure_datetime;
                            const predictedTime = lastStopDropOffOnly
                                ? stopTime.predicted_arrival_datetime
                                : stopTime.predicted_departure_datetime;

                            const time = predictedTime ?? scheduledTime;

                            const delayInSeconds =
                                scheduledTime && predictedTime
                                    ? differenceInSeconds(predictedTime, scheduledTime)
                                    : null;
                            return (
                                <CarouselItem
                                    key={nextTripInstance._id.toString()}
                                    className="md:basis-1/2 lg:basis-1/3"
                                >
                                    <Link
                                        to="."
                                        search={{
                                            tripInstanceId: nextTripInstance._id.toString(),
                                            agencyId,
                                            stopId,
                                            routeId,
                                            directionId,
                                        }}
                                    >
                                        <Card
                                            className={cn(
                                                "p-0 bg-card/15",
                                                nextTripInstance._id === tripInstance?._id
                                                    ? "bg-card/80 dark:bg-card/60"
                                                    : ""
                                            )}
                                        >
                                            <CardContent className="flex items-center justify-center h-16 relative">
                                                <DepartureTime datetime={time || null} />
                                                {delayInSeconds !== null && (
                                                    <RealTimeIndicator
                                                        delaySeconds={delayInSeconds}
                                                    />
                                                )}
                                            </CardContent>
                                        </Card>
                                    </Link>
                                </CarouselItem>
                            );
                        })}
                    </CarouselContent>
                </Carousel>

                {/* Stop times */}
                <div className="overflow-auto">
                    <TransitRouteTimeline
                        stops={
                            tripInstance?.stop_times.map((st) => ({
                                stopName: stopsMap?.get(st.stop_id)?.stop_name || "---",
                                stopTime: format(
                                    st.predicted_arrival_datetime || st.arrival_datetime || "",
                                    "p"
                                ),
                            })) || []
                        }
                        activeStop={
                            tripInstance?.stop_times.findIndex((st) => st.stop_id === stopId) || -1
                        }
                    />
                </div>
            </div>
        </div>
    );
}
