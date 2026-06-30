import TransitRouteTimeline, {
    type TransitStopProps,
} from "@/components/trip-info/transit-timeline";
import { Badge } from "@/components/ui/badge";
import {
    ResponsiveModal,
    ResponsiveModalContent,
    ResponsiveModalDescription,
    ResponsiveModalHeader,
    ResponsiveModalTitle,
    ResponsiveModalTrigger,
} from "@/components/ui/responsible-dialog";
import { getStopAlertEffect } from "@/utils/alert";
import { ensureHexColorStartsWithHash } from "@/utils/css";
import { Link } from "@tanstack/react-router";
import type { inferProcedureOutput } from "@trpc/server";
import { format } from "date-fns";
import type { ReactNode } from "react";
import type { AppRouter } from "transit-api";
import { AlertCarousel } from "./alert-carousel";
import { cn } from "@/lib/utils";

type StopTimeInstance = NonNullable<
    inferProcedureOutput<AppRouter["tripInstance"]["getById"]>
>["stopTimeInstances"][number];

type AlertData = inferProcedureOutput<AppRouter["alert"]["getAlertForTripInstance"]>[number];

export type TripTimelineSectionProps = {
    stopTimeInstances: StopTimeInstance[];
    stopAlerts: AlertData[];
    activeStopIdx: number;
    routeId: number;
    routeColor?: string | null;
    routeTextColor?: string | null;
};

export function TripTimelineSection({
    stopTimeInstances,
    stopAlerts,
    activeStopIdx,
    routeId,
    routeColor,
    routeTextColor,
}: TripTimelineSectionProps) {
    const timelineStops: TransitStopProps[] = stopTimeInstances.map((st) => {
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
            stopTime: (
                <span
                    className={cn({
                        "line-through text-muted-foreground": st.scheduleRelationship === "SKIPPED",
                    })}
                >
                    {format(st.predictedArrivalTime || st.scheduledArrivalTime || "", "p")}
                </span>
            ),
            stopInfo: (
                <div>
                    <div className="mt-1 flex flex-wrap gap-0.5 max-w-56">
                        {st.stop?.stopRoute?.routes
                            ?.filter((r) => r.id !== routeId)
                            .map((r) => (
                                <Badge
                                    key={r.id}
                                    variant="outline"
                                    className="text-[10px] bg-primary-foreground/60 text-primary/60 backdrop-blur-sm"
                                >
                                    {r.shortName}
                                </Badge>
                            ))}
                    </div>
                    {alerts.length > 0 ? (
                        <StopAlertsModal
                            stopName={st.stop?.name}
                            alerts={alerts}
                            trigger={
                                <span className="space-x-2">
                                    {alerts.map((a, i) => (
                                        <span
                                            key={i}
                                            className="text-destructive-foreground font-medium"
                                        >
                                            {getStopAlertEffect(a.effect)?.name || a.effect}
                                        </span>
                                    ))}
                                </span>
                            }
                        />
                    ) : null}
                </div>
            ),
        };
    }) satisfies TransitStopProps[];

    return (
        <TransitRouteTimeline
            stops={timelineStops}
            activeStop={activeStopIdx}
            color={ensureHexColorStartsWithHash(routeColor)}
            fillColor={ensureHexColorStartsWithHash(routeTextColor)}
        />
    );
}

function StopAlertsModal({
    stopName,
    alerts,
    trigger,
}: {
    stopName?: string | null;
    alerts: AlertData[];
    trigger: ReactNode;
}) {
    return (
        <ResponsiveModal>
            <ResponsiveModalTrigger className="space-x-2">{trigger}</ResponsiveModalTrigger>
            <ResponsiveModalContent className="min-w-1/2 max-w-3xl bg-primary-foreground/60 backdrop-blur-md">
                <ResponsiveModalHeader>
                    <ResponsiveModalTitle>Stop Alerts</ResponsiveModalTitle>
                    <ResponsiveModalDescription>{stopName}</ResponsiveModalDescription>
                </ResponsiveModalHeader>
                <AlertCarousel
                    alerts={alerts}
                    orientation="vertical"
                    className="mx-2 mb-2 md:m-0"
                />
            </ResponsiveModalContent>
        </ResponsiveModal>
    );
}
