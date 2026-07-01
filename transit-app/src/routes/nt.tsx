import { TripMap } from "@/components/maps/trip-map";
import type { TripMapStopInfo } from "@/components/maps/types";
import PrimaryPanel from "@/components/primary-panel";
import { AlertCarousel } from "@/components/trip-info/alert-carousel";
import { DepartureCarousel } from "@/components/trip-info/departure/departure-carousel";
import { TripInfoHeader } from "@/components/trip-info/trip-info-header";
import { TripPanelSkeleton } from "@/components/trip-info/trip-panel-skeleton";
import { TripTimelineSection } from "@/components/trip-info/trip-timeline-section";
import { prefetchTripData, useTripData } from "@/hooks/data/use-trip-data";
import { cn } from "@/lib/utils";
import { ensureHexColorStartsWithHash } from "@/utils/css";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { directionEnum } from "database/models/enums";
import { useMemo, useRef } from "react";
import { z } from "zod";

const nextTripsSchema = z.object({
    agencyId: z.string(),
    stopId: z.coerce.number().int(),
    stopSequence: z.coerce.number().int().optional(), // TODO: need to consider circular trips (same stopId twice)
    routeId: z.coerce.number().int(),
    direction: z.enum(directionEnum.enumValues).optional(),
    tripInstanceId: z.coerce.number().int().optional(),
    oppositeStopId: z.coerce.number().int().optional(),
});

export const Route = createFileRoute("/nt")({
    component: RouteComponent,
    validateSearch: nextTripsSchema,

    loaderDeps: ({ search }) => ({
        agencyId: search.agencyId,
        stopId: search.stopId,
        routeId: search.routeId,
        direction: search.direction,
        tripInstanceId: search.tripInstanceId,
    }),
    // Prefetch data used in useTripData hook
    loader: async ({ deps, context: { queryClient: qc } }) => {
        await prefetchTripData(deps, qc);
    },

    // TODO: Add real error component
    errorComponent: ({ error }) => <div>TMP ERROR COMPONENT: {error.message}</div>,
});

function RouteComponent() {
    const searchParams = Route.useSearch();
    const router = useRouter();

    const {
        upcomingDepartures,
        targetTripInst,
        targetStopTimeInstIdx,
        stopAlerts,
        otherAlerts,
        isLoading,
        error,
    } = useTripData(searchParams);

    const targetStopTimeInst = targetTripInst?.stopTimeInstances[targetStopTimeInstIdx];

    const routeAlert = useMemo(() => {
        const routeName = targetTripInst?.trip?.route?.shortName;
        if (!routeName) return null;
        return {
            id: -1,
            url: null,
            agencyId: searchParams.agencyId,
            contentHash: `route-stops-alert-${routeName}`,
            cause: "OTHER_CAUSE" as const,
            effect: "OTHER_EFFECT" as const,
            severity: "INFO" as const,
            headerText: { default: `Stops Alerts` },
            descriptionText: {
                default:
                    "This route has active alerts affecting service. Check the stops below for details.",
            },
            activePeriods: [],
            informedEntities: [{ routeId: searchParams.routeId }],
            lastSeen: new Date(),
            status: "ACTIVE" as const,
        } satisfies (typeof otherAlerts)[number];
    }, [targetTripInst?.trip?.route?.shortName, searchParams.agencyId, searchParams.routeId]);

    const departuresRenderItems = useMemo(() => {
        if (!upcomingDepartures.length || !targetTripInst || !targetStopTimeInst) return [];

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
            scheduleRelationship: targetStopTimeInst.scheduleRelationship,
            startDate: targetTripInst.startDate,
            lastUpdatedAt: targetStopTimeInst.lastUpdatedAt,
            tripHeadsign: targetTripInst.trip?.headsign ?? null,
            isLast: false,
            isStillAtStop: false,
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
    }, [targetTripInst, upcomingDepartures, targetStopTimeInst]);

    const timelineScrollContainerRef = useRef<HTMLDivElement>(null);

    const handleCloseNtPage = () => router.history.back();

    const tripMapStopInfos: TripMapStopInfo[] = (targetTripInst?.stopTimeInstances ?? [])
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

    if (error) {
        return <div>Error: {error.message}</div>;
    }

    return (
        <div className="h-dvh w-dvw relative overflow-clip">
            <div className="w-full h-full absolute top-0 left-0">
                <TripMap
                    tripData={
                        targetTripInst
                            ? {
                                  routeId: targetTripInst.routeId,
                                  direction:
                                      targetTripInst.trip?.direction ?? searchParams.direction,
                                  shapeId: targetTripInst.shapeId,
                                  stopInfos: tripMapStopInfos,
                              }
                            : undefined
                    }
                    routeColor={ensureHexColorStartsWithHash(targetTripInst?.trip?.route?.color)}
                    routeTextColor={ensureHexColorStartsWithHash(
                        targetTripInst?.trip?.route?.textColor,
                    )}
                />
            </div>

            <PrimaryPanel className="p-4 overflow-clip">
                {(snap, snapPoints) =>
                    isLoading || !targetTripInst ? (
                        <TripPanelSkeleton />
                    ) : (
                        //  --- Trip Panel ---
                        <>
                            <TripInfoHeader
                                routeShortName={targetTripInst.trip?.route?.shortName}
                                routeLongName={targetTripInst.trip?.route?.longName}
                                headsign={targetTripInst.trip?.headsign}
                                stopName={targetStopTimeInst?.stop?.name}
                                routeColor={targetTripInst.trip?.route?.color}
                                routeTextColor={targetTripInst.trip?.route?.textColor}
                                onClose={handleCloseNtPage}
                                oppositeTripSearchParams={
                                    searchParams.oppositeStopId !== undefined
                                        ? {
                                              agencyId: searchParams.agencyId,
                                              routeId: searchParams.routeId,
                                              stopId: searchParams.oppositeStopId,
                                              direction:
                                                  searchParams.direction === "INBOUND"
                                                      ? "OUTBOUND"
                                                      : "INBOUND",
                                              oppositeStopId: searchParams.stopId,
                                          }
                                        : undefined
                                }
                            />

                            <DepartureCarousel
                                items={departuresRenderItems}
                                agencyId={searchParams.agencyId}
                                stopId={searchParams.stopId}
                                stopSequence={searchParams.stopSequence}
                                routeId={searchParams.routeId}
                                direction={searchParams.direction}
                                activeTripInstanceId={targetTripInst.id}
                                oppositeStopId={searchParams.oppositeStopId}
                            />

                            <AlertCarousel
                                alerts={routeAlert ? [routeAlert, ...otherAlerts] : otherAlerts}
                                compact
                            />
                            <div
                                className={cn("pb-[100%] overflow-hidden", {
                                    "overflow-y-auto":
                                        snap === snapPoints.at(-1) || snap === snapPoints.at(-2),
                                })}
                            >
                                <TripTimelineSection
                                    stopTimeInstances={targetTripInst.stopTimeInstances}
                                    stopAlerts={stopAlerts}
                                    activeStopIdx={targetStopTimeInstIdx}
                                    routeId={targetTripInst.routeId}
                                    routeColor={targetTripInst.trip?.route?.color}
                                    routeTextColor={targetTripInst.trip?.route?.textColor}
                                />
                            </div>
                        </>
                    )
                }
            </PrimaryPanel>
        </div>
    );
}
