import { DepartureTime } from "@/components/trip-info/depature-time";
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
import type { Direction } from "database/models/enums";
import { differenceInSeconds } from "date-fns";

export type CarouselDeparture = {
    tripInstanceId: number;
    predictedDepartureTime: Date | string | null;
    scheduledDepartureTime: Date | string | null;
    predictedArrivalTime: Date | string | null;
    scheduledArrivalTime: Date | string | null;
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
};

export function DepartureCarousel({
    items,
    agencyId,
    stopId,
    stopSequence,
    routeId,
    direction,
    activeTripInstanceId,
}: DepartureCarouselProps) {
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
                                    stopSequence,
                                    routeId,
                                    direction,
                                }}
                                replace={true}
                            >
                                <Card
                                    className={cn(
                                        "p-0 my-1 bg-card/15",
                                        departure.tripInstanceId === activeTripInstanceId
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
