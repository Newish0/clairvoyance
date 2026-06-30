import type React from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import {
    ResponsiveModal,
    ResponsiveModalContent,
    ResponsiveModalDescription,
    ResponsiveModalHeader,
    ResponsiveModalTitle,
    ResponsiveModalTrigger,
} from "@/components/ui/responsible-dialog";
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

import type { inferProcedureOutput } from "@trpc/server";
import type { AlertCause, AlertEffect, AlertSeverity } from "database/models/enums";
import { addMonths, differenceInCalendarDays, fromUnixTime, getUnixTime } from "date-fns";
import type { ComponentProps } from "react";
import type { AppRouter } from "transit-api";

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

function getStartsInText(alert: {
    status?: string | null;
    activePeriods?: { start: number | null; end: number | null }[] | null;
}): string | null {
    if (alert.status !== "upcoming" || !alert.activePeriods) return null;
    const nowUnix = getUnixTime(new Date());
    const monthFromNowUnix = getUnixTime(addMonths(new Date(), 1));
    const upcoming = alert.activePeriods
        .filter((p) => p.start !== null && p.start > nowUnix && p.start <= monthFromNowUnix)
        .sort((a, b) => (a.start ?? 0) - (b.start ?? 0))[0];
    if (!upcoming?.start) return null;

    const diffDays = differenceInCalendarDays(fromUnixTime(upcoming.start), nowUnix);
    if (diffDays > 1) return `Starts in ${diffDays} days`;
    if (diffDays === 1) return `Starts tomorrow`;
    return "Starting soon";
}

type AlertCarouselProps = {
    alerts: inferProcedureOutput<AppRouter["alert"]["getAlertForTripInstance"]>;
    compact?: boolean;
} & ComponentProps<typeof Carousel>;

function AlertHeaderRow({
    alert,
    headerText,
}: {
    alert: { severity?: string | null; status?: string | null };
    headerText: string;
}) {
    return (
        <div className="flex items-center gap-2">
            {alert.severity === "SEVERE" && <AlertTriangle className="size-4 shrink-0" />}
            {alert.severity === "WARNING" && <AlertCircle className="size-4 shrink-0" />}
            {alert.severity === "INFO" && <Info className="size-4 shrink-0" />}

            <h3 className="font-semibold text-xs leading-tight line-clamp-2">{headerText}</h3>
            {alert.status === "UPCOMING" && (
                <Badge variant="secondary" className="ml-auto text-[9px] px-1.5 py-0">
                    Upcoming
                </Badge>
            )}
        </div>
    );
}

function AlertFullContent({
    alert,
    descText,
    CauseIcon,
    EffectIcon,
}: {
    alert: {
        cause?: string | null;
        effect?: string | null;
        status?: string | null;
        activePeriods?: { start: number | null; end: number | null }[] | null;
    };
    descText: string;
    CauseIcon?: React.ElementType | null;
    EffectIcon?: React.ElementType | null;
}) {
    return (
        <>
            {descText && <p className="text-xs leading-tight opacity-90">{descText}</p>}
            {getStartsInText(alert) && (
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Clock className="size-3 shrink-0" />
                    {getStartsInText(alert)}
                </div>
            )}

            <div className="space-y-1">
                {alert.cause && alert.cause !== "UNKNOWN_CAUSE" && (
                    <div className="flex items-center gap-1.5">
                        {CauseIcon && <CauseIcon className="size-3 shrink-0" />}
                        <span className="text-[9px] font-medium uppercase tracking-wide">
                            {formatCause(alert.cause as AlertCause)}
                        </span>
                    </div>
                )}
                {alert.effect &&
                    alert.effect !== "UNKNOWN_EFFECT" &&
                    alert.effect !== "OTHER_EFFECT" && (
                        <div className="flex items-center gap-1.5">
                            {EffectIcon && <EffectIcon className="size-3 shrink-0" />}
                            <span className="text-[9px] font-medium uppercase tracking-wide line-clamp-1">
                                {formatEffect(alert.effect as AlertEffect)}
                            </span>
                        </div>
                    )}
            </div>
        </>
    );
}

export function AlertCarousel({ alerts, compact, ...others }: AlertCarouselProps) {
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

                    const itemClasses = cn(
                        "basis-full",
                        others.orientation !== "vertical" && alerts.length > 1 ? "basis-2/3" : "",
                    );

                    const cardClasses = cn(
                        "p-3 flex flex-col border-2 transition-colors",
                        alert.severity && getSeverityColor(alert.severity),
                        compact ? "gap-2 cursor-pointer hover:bg-accent/50" : "gap-4",
                    );

                    if (compact) {
                        return (
                            <CarouselItem key={index} className={itemClasses}>
                                <ResponsiveModal>
                                    <ResponsiveModalTrigger asChild>
                                        <Card className={cardClasses}>
                                            <AlertHeaderRow alert={alert} headerText={headerText} />
                                        </Card>
                                    </ResponsiveModalTrigger>
                                    <ResponsiveModalContent>
                                        <ResponsiveModalHeader>
                                            <ResponsiveModalTitle>
                                                {headerText}
                                            </ResponsiveModalTitle>
                                            <ResponsiveModalDescription asChild>
                                                <div className="space-y-4 pt-2">
                                                    <AlertFullContent
                                                        alert={alert}
                                                        descText={descText}
                                                        CauseIcon={CauseIcon}
                                                        EffectIcon={EffectIcon}
                                                    />
                                                </div>
                                            </ResponsiveModalDescription>
                                        </ResponsiveModalHeader>
                                    </ResponsiveModalContent>
                                </ResponsiveModal>
                            </CarouselItem>
                        );
                    }

                    return (
                        <CarouselItem key={index} className={itemClasses}>
                            <Card className={cardClasses}>
                                <AlertHeaderRow alert={alert} headerText={headerText} />
                                <AlertFullContent
                                    alert={alert}
                                    descText={descText}
                                    CauseIcon={CauseIcon}
                                    EffectIcon={EffectIcon}
                                />
                            </Card>
                        </CarouselItem>
                    );
                })}
            </CarouselContent>
        </Carousel>
    );
}
