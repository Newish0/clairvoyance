import { AppSettings } from "@/components/app-settings";
import { TripMap, type TripMapStopInfo } from "@/components/maps/trip-map";
import { AlertCarousel } from "@/components/trip-info/alert-carousel";
import { DepartureTime } from "@/components/trip-info/depature-time";
import TransitRouteTimeline from "@/components/trip-info/transit-timeline";
import { VirtualizedSchedule } from "@/components/trip-info/virtualized-schedule";
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
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { trpcClient } from "@/main";
import { getStopAlertEffect } from "@/utils/alert";
import { ensureHexColorStartsWithHash } from "@/utils/css";
import { isDataRealtime } from "@/utils/date";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useHover } from "ahooks";
import { directionEnum } from "database/models/enums";
import { differenceInSeconds, format } from "date-fns";
import { SettingsIcon, X } from "lucide-react";
import { useMemo, useRef } from "react";
import { z } from "zod";

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
    loaderDeps: ({ search: { agencyId, tripInstanceId, stopId, routeId, direction } }) => ({
        agencyId,
        tripInstanceId,
        stopId,
        routeId,
        direction,
    }),

    loader: async ({ deps: { agencyId, stopId, routeId, direction, tripInstanceId } }) => {
        const upcomingDepartures = await trpcClient.tripInstance.getUpcomingDepartures.query({
            stopId,
            routeId,
            direction,
            limit: 5,
        });

        if (!upcomingDepartures.length) {
            throw new Error(
                `No departures found for stopId: ${stopId}, routeId: ${routeId}, direction: ${direction}`,
            );
        }

        const resolvedTripInstanceId = tripInstanceId ?? upcomingDepartures[0].tripInstanceId;

        const targetTripInst = await trpcClient.tripInstance.getById.query(resolvedTripInstanceId);

        if (!targetTripInst) {
            throw new Error(`No trip found for tripInstanceId: ${resolvedTripInstanceId}`);
        }

        // TODO: Consider circular trips with stopSequence
        const targetStopTimeInstIdx = targetTripInst?.stopTimeInstances.findIndex(
            (st) => st.stopId === stopId,
        );

        if (targetTripInst.stopTimeInstances.every((st) => st.stopId !== stopId)) {
            throw new Error(
                `No stopTime found for stopId: ${stopId} on tripInstanceId: ${tripInstanceId}`,
            );
        }

        const stopIds = targetTripInst.stopTimeInstances
            .map((st) => st.stopId)
            .filter((id) => id !== null);

        const alerts = await trpcClient.alert.getAlertForTripInstance.query({
            agencyId,
            routeId,
            direction,
            stopIds,
            tripInstanceId: resolvedTripInstanceId,
            routeType: targetTripInst.trip?.route?.type,
        });

        const stopAlerts = alerts.filter((a) => a.informedEntities?.some((e) => e.stopId !== null));
        const otherAlerts = alerts.filter((a) =>
            a.informedEntities?.some((e) => e.stopId === null),
        );

        return {
            upcomingDepartures,
            targetTripInst,
            targetStopTimeInstIdx,
            stopAlerts,
            otherAlerts,
        };
    },
    // TODO: Add real error component
    errorComponent: ({ error }) => <div>TMP ERROR COMPONENT: {error.message}</div>,
});

function RouteComponent() {
    const searchParams = Route.useSearch();
    const { upcomingDepartures, targetTripInst, targetStopTimeInstIdx, stopAlerts, otherAlerts } =
        Route.useLoaderData();
    const targetStopTimeInst = targetTripInst.stopTimeInstances[targetStopTimeInstIdx];
    const router = useRouter();

    const departuresRenderItems = useMemo(() => {
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
            effectiveTime: targetStopTimeInst.effectiveTime,
            startDate: targetTripInst.startDate,
            lastUpdatedAt: targetStopTimeInst.lastUpdatedAt,
            tripHeadsign: targetTripInst.trip?.headsign ?? null,
            isLast: false, // Unused (any arb value)
            isStillAtStop: false, // Unused (any arb value)
        };

        if (
            !targetAsDeparture.effectiveTime ||
            !upcomingDepartures[0]?.effectiveTime ||
            targetAsDeparture.effectiveTime < upcomingDepartures[0].effectiveTime
        ) {
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

    const tripMapStopInfos: TripMapStopInfo[] = targetTripInst.stopTimeInstances
        .filter((st) => st.stop && st.stop.location)
        .map(
            (st) =>
                ({
                    stopId: st.stop!.id,
                    sequence: st.stopSequence,
                    effectiveTime: st.effectiveTime,
                    name: st.stop!.name || "Unknown Stop",
                    lng: st.stop!.location!.x,
                    lat: st.stop!.location!.y,
                    shapeDistTraveled: st.shapeDistTraveled,
                    isTarget: st.stopSequence === targetStopTimeInst?.stopSequence,
                    alerts: stopAlerts.filter((a) =>
                        a.informedEntities?.some((e) => e.stopId === st.stopId),
                    ),
                }) satisfies TripMapStopInfo,
        );

    return (
        <div className="h-dvh w-dvw relative overflow-clip">
            <div className="w-full h-full absolute top-0 left-0">
                <TripMap
                    routeId={targetTripInst.routeId}
                    direction={targetTripInst.trip?.direction ?? searchParams.direction}
                    shapeId={targetTripInst.shapeId}
                    stopInfos={tripMapStopInfos}
                    routeColor={ensureHexColorStartsWithHash(targetTripInst.trip?.route?.color)}
                    routeTextColor={ensureHexColorStartsWithHash(
                        targetTripInst.trip?.route?.textColor,
                    )}
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
                        {departuresRenderItems.map((r) => {
                            if (r.type === "divider") {
                                return (
                                    <div key="divider" className="ml-4 flex gap-0.5 py-2">
                                        <Separator orientation="vertical" />
                                        <Separator orientation="vertical" />
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
                                            agencyId: searchParams.agencyId,
                                            stopId: searchParams.stopId,
                                            stopSequence: searchParams.stopSequence,
                                            routeId: searchParams.routeId,
                                            direction: searchParams.direction,
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
                                        <VirtualizedSchedule
                                            agencyId={searchParams.agencyId}
                                            routeId={searchParams.routeId}
                                            stopId={searchParams.stopId}
                                            direction={searchParams.direction}
                                            activeTripInstanceId={targetTripInst.id}
                                        />
                                    </div>
                                </ResponsiveModalContent>
                            </ResponsiveModal>
                        </CarouselItem>
                    </CarouselContent>
                </Carousel>
                <AlertCarousel alerts={otherAlerts} />

                {/* Stop times */}
                <div ref={hoverRef} className="overflow-auto">
                    <TransitRouteTimeline
                        stops={
                            targetTripInst?.stopTimeInstances.map((st) => {
                                const alerts = stopAlerts.filter((a) =>
                                    a.informedEntities?.some?.((ie) => ie.stopId === st.stopId),
                                );
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
                                        <div>
                                            <div className="mt-1 flex flex-wrap gap-0.5 max-w-56">
                                                {st.stop?.stopRoute?.routes
                                                    ?.filter(
                                                        (r) => r.id !== targetTripInst?.routeId,
                                                    )
                                                    .map((r) => (
                                                        <Badge
                                                            key={r.id}
                                                            variant={"outline"}
                                                            className="text-[10px] bg-primary-foreground/60 text-primary/60 backdrop-blur-sm"
                                                        >
                                                            {r.shortName}
                                                        </Badge>
                                                    ))}
                                            </div>
                                            {alerts.length > 0 ? (
                                                <ResponsiveModal>
                                                    <ResponsiveModalTrigger className="space-x-2">
                                                        {alerts.map((a) => (
                                                            <span className="text-destructive-foreground font-medium">
                                                                {getStopAlertEffect(a.effect)?.name}
                                                            </span>
                                                        ))}
                                                    </ResponsiveModalTrigger>
                                                    <ResponsiveModalContent className="min-w-1/2 max-w-3xl bg-primary-foreground/60 backdrop-blur-md">
                                                        <ResponsiveModalHeader>
                                                            <ResponsiveModalTitle>
                                                                Stop Alerts
                                                            </ResponsiveModalTitle>
                                                            <ResponsiveModalDescription>
                                                                {st.stop?.name}
                                                            </ResponsiveModalDescription>
                                                        </ResponsiveModalHeader>
                                                        <AlertCarousel
                                                            alerts={alerts}
                                                            orientation="vertical"
                                                            className="mx-2 mb-2 md:m-0"
                                                        />
                                                    </ResponsiveModalContent>
                                                </ResponsiveModal>
                                            ) : null}
                                        </div>
                                    ),
                                };
                            }) || []
                        }
                        activeStop={targetStopTimeInstIdx}
                        color={ensureHexColorStartsWithHash(targetTripInst.trip?.route?.color)}
                        fillColor={ensureHexColorStartsWithHash(
                            targetTripInst.trip?.route?.textColor,
                        )}
                    />
                </div>
            </div>
        </div>
    );
}
