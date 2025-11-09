"use client";

import type React from "react";

import { Card } from "@/components/ui/card";
import {
    Carousel,
    CarouselContent,
    CarouselItem,
    CarouselNext,
    CarouselPrevious,
} from "@/components/ui/carousel";
import {
    AlertCircle,
    AlertTriangle,
    Info,
    Wrench,
    Zap,
    CloudRain,
    Construction,
    Users,
    Activity,
    Ban,
    Clock,
    MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
    AlertCause,
    AlertEffect,
    type AlertSeverity,
    type Direction,
    type RouteType,
} from "../../../../gtfs-processor/shared/gtfs-db-types";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/main";

function getCauseIcon(cause: AlertCause) {
    const iconMap: Record<AlertCause, React.ElementType> = {
        TECHNICAL_PROBLEM: Zap,
        CONSTRUCTION: Construction,
        WEATHER: CloudRain,
        MAINTENANCE: Wrench,
        ACCIDENT: AlertCircle,
        STRIKE: Users,
        DEMONSTRATION: Users,
        POLICE_ACTIVITY: Activity,
        MEDICAL_EMERGENCY: AlertCircle,
        HOLIDAY: Info,
        OTHER_CAUSE: Info,
        UNKNOWN_CAUSE: Info,
    };
    return iconMap[cause];
}

function getEffectIcon(effect: AlertEffect) {
    const iconMap: Record<AlertEffect, React.ElementType> = {
        NO_SERVICE: Ban,
        REDUCED_SERVICE: Clock,
        SIGNIFICANT_DELAYS: Clock,
        DETOUR: MapPin,
        MODIFIED_SERVICE: AlertCircle,
        STOP_MOVED: MapPin,
        ADDITIONAL_SERVICE: Info,
        ACCESSIBILITY_ISSUE: AlertTriangle,
        OTHER_EFFECT: Info,
        UNKNOWN_EFFECT: Info,
        NO_EFFECT: Info,
    };
    return iconMap[effect];
}

function getSeverityColor(severity: AlertSeverity) {
    const colorMap: Record<AlertSeverity, string> = {
        SEVERE: "bg-card/80 dark:bg-card/60",
        WARNING: "bg-card/80 dark:bg-card/60",
        INFO: "bg-card/80 dark:bg-card/60",
        UNKNOWN_SEVERITY: "bg-card/80 dark:bg-card/60",
    };
    return colorMap[severity];
}

function formatCause(cause: AlertCause): string {
    return cause
        .split("_")
        .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
        .join(" ");
}

function formatEffect(effect: AlertEffect): string {
    return effect
        .split("_")
        .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
        .join(" ");
}

type AlertCarouselProps = {
    agencyId?: string;
    routeId?: string;
    directionId?: Direction;
    tripInstanceId?: string;
    stopIds?: string | string[];
    routeType?: RouteType;
};

export function AlertCarousel({
    agencyId,
    routeId,
    directionId,
    tripInstanceId,
    stopIds,
}: AlertCarouselProps) {
    const { data: alerts } = useQuery({
        ...trpc.alert.getActiveAlerts.queryOptions({
            agencyId,
            routeId,
            directionId,
            stopId: stopIds,
            tripInstanceId,
        }),
    });

    return (
        <div className="w-full max-w-sm mx-auto">
            <Carousel
                opts={{
                    align: "start",
                    slidesToScroll: 1,
                }}
                className="w-full"
            >
                <CarouselContent className="">
                    {alerts?.map((alert, index) => {
                        const CauseIcon = getCauseIcon(alert.cause);
                        const EffectIcon = getEffectIcon(alert.effect);
                        const headerText = alert.header_text[0]?.text || "Alert";
                        const descText = alert.description_text[0]?.text || "";

                        return (
                            <CarouselItem
                                key={index}
                                className={cn("basis-full", alerts.length > 1 ? "basis-2/3" : "")}
                            >
                                <Card
                                    className={cn(
                                        "p-3 flex flex-col gap-4 border-2 transition-colors",
                                        getSeverityColor(alert.severity_level)
                                    )}
                                >
                                    {/* Header with severity icon */}
                                    <div className="flex items-center gap-2">
                                        {alert.severity_level === "SEVERE" && (
                                            <AlertTriangle className="size-4 shrink-0" />
                                        )}
                                        {alert.severity_level === "WARNING" && (
                                            <AlertCircle className="size-4 shrink-0" />
                                        )}
                                        {alert.severity_level === "INFO" && (
                                            <Info className="size-4 shrink-0" />
                                        )}

                                        <h3 className="font-semibold text-xs leading-tight line-clamp-2">
                                            {headerText}
                                        </h3>
                                    </div>

                                    {/* Description */}
                                    <p className="text-xs leading-tight opacity-90">{descText}</p>

                                    {/* Cause and Effect */}
                                    <div className="space-y-1">
                                        {alert.cause !== AlertCause.UNKNOWN_CAUSE && (
                                            <div className="flex items-center gap-1.5">
                                                <CauseIcon className="size-3 shrink-0" />
                                                <span className="text-[9px] font-medium uppercase tracking-wide">
                                                    {formatCause(alert.cause)}
                                                </span>
                                            </div>
                                        )}
                                        {alert.effect !== AlertEffect.UNKNOWN_EFFECT &&
                                            alert.effect !== AlertEffect.OTHER_EFFECT && (
                                                <div className="flex items-center gap-1.5">
                                                    <EffectIcon className="size-3 shrink-0" />
                                                    <span className="text-[9px] font-medium uppercase tracking-wide line-clamp-1">
                                                        {formatEffect(alert.effect)}
                                                    </span>
                                                </div>
                                            )}
                                    </div>
                                </Card>
                            </CarouselItem>
                        );
                    })}
                </CarouselContent>
            </Carousel>
        </div>
    );
}
