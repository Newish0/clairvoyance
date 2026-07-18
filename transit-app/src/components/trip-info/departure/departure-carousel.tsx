import { DepartureTime } from "@/components/trip-info/departure/departure-time";
import { VirtualizedSchedule } from "@/components/trip-info/virtualized-schedule";
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
import { isDataRealtime } from "@/utils/date";
import { Link } from "@tanstack/react-router";
import type { Direction, StopTimeUpdateScheduleRelationship } from "database/models/enums";
import { differenceInSeconds } from "date-fns";

export type CarouselDeparture = {
    tripInstanceId: number;
    tripHeadsign: string | null;
    predictedDepartureTime: Date | string | null;
    scheduledDepartureTime: Date | string | null;
    predictedArrivalTime: Date | string | null;
    scheduledArrivalTime: Date | string | null;
    scheduleRelationship: StopTimeUpdateScheduleRelationship | null;
    lastUpdatedAt: Date | string | null;
};

export type DepartureCarouselItem =
    | { type: "divider" }
    | { type: "departure"; departure: CarouselDeparture };

export type DepartureCarouselProps = {
    items: DepartureCarouselItem[];
    agencyId: string;
    stopId: number;
    stopSequence?: number;
    routeId: number;
    direction?: Direction;
    activeTripInstanceId: number;
    oppositeStopId?: number;
};

export function DepartureCarousel({
    items,
    agencyId,
    stopId,
    stopSequence,
    routeId,
    direction,
    activeTripInstanceId,
    oppositeStopId,
}: DepartureCarouselProps) {
    const hasMultiTripHeadsigns = items.some(
        (a) =>
            a.type === "departure" &&
            items.some(
                (b) =>
                    b.type === "departure" && b.departure.tripHeadsign !== a.departure.tripHeadsign,
            ),
    );

    return (
        <Carousel
            opts={{
                dragFree: true,
            }}
        >
            <CarouselContent>
                {items.map((r) => {
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
                        !departure.predictedDepartureTime || !departure.scheduledDepartureTime;

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
                            ? differenceInSeconds(new Date(predictedTime), new Date(scheduledTime))
                            : null;

                    return (
                        <CarouselItem key={departure.tripInstanceId} className="basis-3/10">
                            <Link
                                to="."
                                search={{
                                    tripInstanceId: departure.tripInstanceId,
                                    agencyId,
                                    stopId,
                                    stopSequence,
                                    routeId,
                                    direction,
                                    oppositeStopId,
                                }}
                                replace={true}
                            >
                                <Card
                                    className={cn(
                                        "p-2 bg-card/15 h-full",
                                        departure.tripInstanceId === activeTripInstanceId
                                            ? "bg-card/80 dark:bg-card/60"
                                            : "",
                                    )}
                                >
                                    <CardContent
                                        className={cn(
                                            "flex flex-col items-center justify-center text-center px-0 h-full",
                                            {
                                                "line-through text-muted-foreground":
                                                    departure.scheduleRelationship === "SKIPPED",
                                            },
                                        )}
                                    >
                                        <div className="flex items-center gap-1">
                                            <DepartureTime datetime={time || null} variant="long" />
                                            {delayInSeconds !== null && (
                                                <RealTimeIndicator
                                                    delaySeconds={delayInSeconds}
                                                    className="-mt-2"
                                                />
                                            )}
                                        </div>

                                        {hasMultiTripHeadsigns && (
                                            <>
                                                <Separator
                                                    orientation="horizontal"
                                                    className="my-2 w-full"
                                                />

                                                <h5 className="text-xs text-muted-foreground text-wrap leading-tight">
                                                    {departure.tripHeadsign}
                                                </h5>
                                            </>
                                        )}
                                    </CardContent>
                                </Card>
                            </Link>
                        </CarouselItem>
                    );
                })}

                <CarouselItem className="basis-3/10">
                    <ResponsiveModal>
                        <ResponsiveModalTrigger asChild>
                            <Card className={cn("p-0 bg-card/15 cursor-pointer h-full")}>
                                <CardContent className="flex items-center justify-center px-0 h-full">
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
                                    agencyId={agencyId}
                                    routeId={routeId}
                                    stopId={stopId}
                                    direction={direction}
                                    activeTripInstanceId={activeTripInstanceId}
                                />
                            </div>
                        </ResponsiveModalContent>
                    </ResponsiveModal>
                </CarouselItem>
            </CarouselContent>
        </Carousel>
    );
}
