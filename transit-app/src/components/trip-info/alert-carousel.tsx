import type React from "react";

import { Card } from "@/components/ui/card";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import { cn } from "@/lib/utils";
import {
    Activity,
    AlertCircle,
    AlertTriangle,
    Ban,
    Clock,
    CloudRain,
    Construction,
    Info,
    MapPin,
    Users,
    Wrench,
    Zap,
} from "lucide-react";

import { trpc } from "@/main";
import { useQuery } from "@tanstack/react-query";
import type {
    AlertCause,
    AlertEffect,
    AlertSeverity,
    Direction,
    RouteType,
} from "database/models/enums";
import type { inferProcedureOutput } from "@trpc/server";
import type { AppRouter } from "transit-api";
import type { ComponentProps } from "react";

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
    alerts: inferProcedureOutput<AppRouter["alert"]["getAlertForTripInstance"]>;
} & ComponentProps<typeof Carousel>;

export function AlertCarousel({ alerts, ...others }: AlertCarouselProps) {
    return (
        <Carousel
            opts={{
                align: "start",
                slidesToScroll: 1,
            }}
            {...others}
        >
            <CarouselContent className="">
                {alerts?.map((alert, index) => {
                    const CauseIcon = alert.cause && getCauseIcon(alert.cause);
                    const EffectIcon = alert.effect && getEffectIcon(alert.effect);
                    const headerText = alert.headerText.default || "Alert";
                    const descText = alert.descriptionText.default || "";

                    return (
                        <CarouselItem
                            key={index}
                            className={cn(
                                "basis-full",
                                others.orientation !== "vertical" && alerts.length > 1 ? "basis-2/3" : "",
                            )}
                        >
                            <Card
                                className={cn(
                                    "p-3 flex flex-col gap-4 border-2 transition-colors",
                                    alert.severity && getSeverityColor(alert.severity),
                                )}
                            >
                                {/* Header with severity icon */}
                                <div className="flex items-center gap-2">
                                    {alert.severity === "SEVERE" && (
                                        <AlertTriangle className="size-4 shrink-0" />
                                    )}
                                    {alert.severity === "WARNING" && (
                                        <AlertCircle className="size-4 shrink-0" />
                                    )}
                                    {alert.severity === "INFO" && (
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
                                    {alert.cause !== "UNKNOWN_CAUSE" && (
                                        <div className="flex items-center gap-1.5">
                                            {CauseIcon && <CauseIcon className="size-3 shrink-0" />}
                                            <span className="text-[9px] font-medium uppercase tracking-wide">
                                                {alert.cause && formatCause(alert.cause)}
                                            </span>
                                        </div>
                                    )}
                                    {alert.effect !== "UNKNOWN_EFFECT" &&
                                        alert.effect !== "OTHER_EFFECT" && (
                                            <div className="flex items-center gap-1.5">
                                                {EffectIcon && (
                                                    <EffectIcon className="size-3 shrink-0" />
                                                )}
                                                <span className="text-[9px] font-medium uppercase tracking-wide line-clamp-1">
                                                    {alert.effect && formatEffect(alert.effect)}
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
    );
}
