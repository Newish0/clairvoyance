import { AppSettings } from "@/components/app-settings";
// import { TripMap } from "@/components/maps/trip-map";
// import { AlertCarousel } from "@/components/trip-info/alert-carousel";
import { DepartureTime } from "@/components/trip-info/depature-time";
import TransitRouteTimeline from "@/components/trip-info/transit-timeline";
// import { VirtualizedSchedule } from "@/components/trip-info/virtualized-schedule";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import { RealTimeIndicator } from "@/components/ui/realtime-indicator";
import {
    ResponsiveModal,
    ResponsiveModalContent,
    ResponsiveModalDescription,
    ResponsiveModalHeader,
    ResponsiveModalTitle,
    ResponsiveModalTrigger,
} from "@/components/ui/responsible-dialog";
import { cn } from "@/lib/utils";
import { trpc } from "@/main";
import { ensureHexColorStartsWithHash } from "@/utils/css";
import { isDataRealtime } from "@/utils/date";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { differenceInSeconds, format } from "date-fns";
import { SettingsIcon, X } from "lucide-react";
import { useMemo, useRef } from "react";
import { z } from "zod";
import { useHover } from "ahooks";
import { directionEnum } from "database/models/enums";
import { Separator } from "@/components/ui/separator";

const nextTripsSchema = z.object({
    agencyId: z.string(),
    stopId: z.coerce.number().int(),
    stopSequence: z.coerce.number().int().optional(), // TODO: need to consider circular trips (same stopId twice)
    routeId: z.coerce.number().int(),
    direction: z.enum(directionEnum.enumValues).optional(),
    tripInstanceId: z.coerce.number().int().optional(),
});

export const Route = createFileRoute("/nt")({
    component: RouteComponent,
    validateSearch: nextTripsSchema,
});

function RouteComponent() {
    // TODO: Check if we actually always need direction
    const { agencyId, stopId, routeId, direction = "OUTBOUND", tripInstanceId } = Route.useSearch();
    const router = useRouter();

    const { data: targetTripInst } = useQuery({
        ...trpc.tripInstance.getById.queryOptions(tripInstanceId!!),
        enabled: tripInstanceId !== undefined,
    });

    const { data: upcomingDepartures } = useQuery({
        ...trpc.tripInstance.getUpcomingDepartures.queryOptions({
            stopId,
            routeId,
            direction,
            limit: 5,
        }),
    });

    // TODO: Consider circular trips with stopSequence
    const targetStopTimeInst = targetTripInst?.stopTimeInstances.find((st) => st.stopId === stopId);

    const combinedResolvedDepartures = useMemo(() => {
        if (!upcomingDepartures || !targetTripInst || !targetStopTimeInst) return [];

        const resolvedUpcoming = upcomingDepartures.map(
            (d) =>
                ({
                    type: "departure",
                    departure: d,
                }) as const,
        );

        const targetInDepartures = upcomingDepartures.some(
            (d) => d.tripInstanceId === targetTripInst.id,
        );
        if (targetInDepartures) return resolvedUpcoming;

        const targetAsDeparture: (typeof upcomingDepartures)[number] = {
            tripInstanceId: targetTripInst.id,
            stopTimeInstanceId: targetStopTimeInst.id,
            stopSequence: targetStopTimeInst.stopSequence,
            predictedArrivalTime: targetStopTimeInst.predictedArrivalTime,
            predictedDepartureTime: targetStopTimeInst.predictedDepartureTime,
            scheduledArrivalTime: targetStopTimeInst.scheduledArrivalTime,
            scheduledDepartureTime: targetStopTimeInst.scheduledDepartureTime,
            effectiveTime: (targetStopTimeInst.predictedDepartureTime ??
                targetStopTimeInst.scheduledDepartureTime ??
                targetStopTimeInst.predictedArrivalTime ??
                targetStopTimeInst.scheduledArrivalTime)!,
            startDate: targetTripInst.startDate,
            lastUpdatedAt: targetStopTimeInst.lastUpdatedAt,
            isLast: false, // Unused (any arb value)
            isStillAtStop: false, // Unused (any arb value)
        };

        if (targetAsDeparture.effectiveTime < upcomingDepartures[0]?.effectiveTime) {
            return [
                { type: "departure", departure: targetAsDeparture } as const,
                { type: "divider" } as const,
                ...resolvedUpcoming,
            ];
        } else {
            return [
                ...resolvedUpcoming,
                { type: "divider" } as const,
                { type: "departure", departure: targetAsDeparture } as const,
            ];
        }
    }, [targetTripInst, upcomingDepartures]);

    const hoverRef = useRef<HTMLDivElement>(null);
    const hovering = useHover(hoverRef);

    const handleCloseNtPage = () => {
        router.history.back();
    };

    if (targetTripInst && targetTripInst.stopTimeInstances.every((st) => st.stopId !== stopId)) {
        return <div>Invalid stop</div>;
    }

    return (
        <div className="h-dvh w-dvw relative overflow-clip">
            <div className="w-full h-full absolute top-0 left-0">
                {/* <TripMap
                    agencyId={agencyId}
                    routeId={routeId}
                    direction={directionId}
                    atStopId={stopId}
                    atStopDistTraveled={atStopDistTraveled}
                    stopIds={tripInstance?.stop_times.map((st) => st.stop_id) ?? []}
                    stopTimes={tripInstance?.stop_times}
                    shapeObjectId={tripInstance?.shape ?? undefined}
                    routeColor={
                        ensureHexColorStartsWithHash(tripInstance?.route?.route_color) ?? undefined
                    }
                    routeTextColor={
                        ensureHexColorStartsWithHash(tripInstance?.route?.route_text_color) ??
                        undefined
                    }
                /> */}
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

            <div
                tabIndex={0}
                className={cn(
                    "absolute bottom-4 md:top-4 left-4 max-h-[50dvh] w-[calc(100%-2rem)] md:w-sm flex flex-col gap-3 overflow-clip p-4 rounded-xl bg-primary-foreground/60 backdrop-blur-md",
                    hovering && "max-h-[80dvh]",
                    "md:max-h-[calc(100dvh-2rem)]",
                )}
            >
                {/* Top row */}
                <div className="flex justify-between">
                    {/* Trip info */}
                    <div className="flex items-center space-x-2 w-full overflow-hidden">
                        <Badge
                            variant="secondary"
                            className="text-sm font-bold"
                            style={{
                                backgroundColor: ensureHexColorStartsWithHash(
                                    targetTripInst?.trip?.route?.color,
                                ),
                                color: ensureHexColorStartsWithHash(
                                    targetTripInst?.trip?.route?.textColor,
                                ),
                            }}
                        >
                            {targetTripInst?.trip?.route?.shortName || "---"}
                        </Badge>

                        <div className="overflow-hidden">
                            <p className="font-semibold truncate">
                                {targetTripInst?.trip?.headsign || "---"}
                            </p>

                            <p className="text-xs text-muted-foreground truncate">
                                At {targetStopTimeInst?.stop?.name || "---"}
                            </p>
                        </div>
                    </div>
                    <div className="">
                        <Button variant="ghost" size="icon" onClick={handleCloseNtPage}>
                            <X />
                        </Button>
                    </div>
                </div>

                {/* Other trips  */}
                <Carousel
                    opts={{
                        dragFree: true,
                    }}
                >
                    <CarouselContent>
                        {combinedResolvedDepartures.map((r) => {
                            if (r.type === "divider") {
                                return (
                                    <div className="ml-4 flex gap-0.5 py-2">
                                        <Separator key="divider" orientation="vertical" />
                                        <Separator key="divider" orientation="vertical" />
                                    </div>
                                );
                            }

                            const { departure } = r;

                            const lastStopDropOffOnly =
                                !departure.predictedDepartureTime ||
                                !departure.scheduledDepartureTime;

                            const scheduledTime = lastStopDropOffOnly
                                ? departure.scheduledArrivalTime
                                : departure.scheduledDepartureTime;
                            const predictedTime = lastStopDropOffOnly
                                ? departure.predictedArrivalTime
                                : departure.predictedDepartureTime;

                            const time = predictedTime ?? scheduledTime;

                            const delayInSeconds =
                                scheduledTime &&
                                predictedTime &&
                                departure.lastUpdatedAt &&
                                isDataRealtime(departure.lastUpdatedAt)
                                    ? differenceInSeconds(predictedTime, scheduledTime)
                                    : null;

                            return (
                                <CarouselItem
                                    key={departure.tripInstanceId}
                                    className="basis-1/3 lg:basis-1/4"
                                >
                                    <Link
                                        to="."
                                        search={{
                                            tripInstanceId: departure.tripInstanceId,
                                            agencyId,
                                            stopId,
                                            routeId,
                                            direction,
                                        }}
                                        replace={true}
                                    >
                                        <Card
                                            className={cn(
                                                "p-0 my-1 bg-card/15",
                                                departure.tripInstanceId === targetTripInst?.id
                                                    ? "bg-card/80 dark:bg-card/60"
                                                    : "",
                                            )}
                                        >
                                            <CardContent className="flex items-center justify-center h-16 relative">
                                                <DepartureTime datetime={time || null} />
                                                {delayInSeconds !== null && (
                                                    <RealTimeIndicator
                                                        delaySeconds={delayInSeconds}
                                                        className="mt-2 mr-2"
                                                    />
                                                )}
                                            </CardContent>
                                        </Card>
                                    </Link>
                                </CarouselItem>
                            );
                        })}

                        <CarouselItem className="basis-1/3 lg:basis-1/4">
                            <ResponsiveModal>
                                <ResponsiveModalTrigger asChild>
                                    <Card className={cn("p-0 bg-card/15 cursor-pointer")}>
                                        <CardContent className="flex items-center justify-center h-16 relative">
                                            <div className="font-bold text-sm">More...</div>
                                        </CardContent>
                                    </Card>
                                </ResponsiveModalTrigger>
                                <ResponsiveModalContent className="bg-primary-foreground/60 backdrop-blur-md">
                                    <ResponsiveModalHeader>
                                        <ResponsiveModalTitle></ResponsiveModalTitle>
                                        <ResponsiveModalDescription></ResponsiveModalDescription>
                                    </ResponsiveModalHeader>
                                    <div className="p-4 overflow-auto">
                                        {/* <VirtualizedSchedule
                                            agencyId={agencyId}
                                            routeId={routeId}
                                            stopId={stopId}
                                            activeTripInstanceId={tripInstanceId}
                                            directionId={directionId}
                                        /> */}
                                    </div>
                                </ResponsiveModalContent>
                            </ResponsiveModal>
                        </CarouselItem>
                    </CarouselContent>
                </Carousel>

                {/* <AlertCarousel
                    agencyId={agencyId}
                    routeId={routeId}
                    directionId={directionId}
                    tripInstanceId={tripInstanceId}
                    stopIds={tripInstance?.stop_times.map((st) => st.stop_id)}
                    // routeType={routeType}
                /> */}

                {/* Stop times */}
                <div ref={hoverRef} className="overflow-auto">
                    <TransitRouteTimeline
                        stops={
                            targetTripInst?.stopTimeInstances.map((st) => {
                                return {
                                    stopName: (
                                        <Link
                                            to="/"
                                            search={{
                                                lng: st.stop?.location?.x,
                                                lat: st.stop?.location?.y,
                                            }}
                                        >
                                            {st.stop?.name || "---"}
                                        </Link>
                                    ),
                                    stopTime: format(
                                        st.predictedArrivalTime || st.scheduledArrivalTime || "",
                                        "p",
                                    ),
                                    stopInfo: (
                                        <></>
                                        // <TimelineStopInfo
                                        //     agencyId={agencyId}
                                        //     stopTimeInstance={st}
                                        //     currentRouteObjectId={tripInstance.route?._id.toString()}
                                        // />
                                    ),
                                };
                            }) || []
                        }
                        activeStop={
                            targetTripInst?.stopTimeInstances.findIndex(
                                (st) => st === targetStopTimeInst,
                            ) ?? -1
                        }
                    />
                </div>
            </div>
        </div>
    );
}

// const TimelineStopInfo = ({
//     agencyId,
//     stopTimeInstance,
//     currentRouteObjectId,
// }: {
//     agencyId: string;
//     currentRouteObjectId?: string;
// }) => {
//     const { data: routesAtStop } = useQuery({
//         ...trpc.stop.getNearbyRoutesByStop.queryOptions({
//             agencyId,
//             stopId: stopTimeInstance.stop_id,
//         }),
//     });

//     const filteredRoutesAtStop = routesAtStop?.filter(
//         (r) => r._id.toString() !== currentRouteObjectId,
//     );

//     return (
//         <div className="space-x-1 mt-1">
//             {filteredRoutesAtStop?.map((r) => (
//                 <Badge key={r.route_id} variant={"outline"}>
//                     {r.route_short_name}
//                 </Badge>
//             ))}
//         </div>
//     );
// };
