import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useBidirectionalTripInstancesByRouteStopTimes } from "@/hooks/data/use-bidirectional-trips";
import type { TrpcRouterOutputs } from "@/main";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
    addHours,
    differenceInMilliseconds,
    differenceInSeconds,
    format,
    startOfDay,
    startOfHour,
} from "date-fns";
import { useEffect, useRef, useState } from "react";
import { Direction } from "../../../../gtfs-processor/shared/gtfs-db-types";
import { DatePickerDropdown } from "../ui/date-picker-dropdown";
import { cn } from "@/lib/utils";
import { RealTimeIndicator } from "../ui/realtime-indicator";

type VirtualizedScheduleProps = {
    agencyId: string;
    routeId: string;
    stopId: string;
    directionId?: Direction;
    activeTripInstanceId?: string;
};

// Define discriminated union types for render items
type LoaderItem = {
    type: "loader";
    id: string;
    direction: "previous" | "next";
};

type DateHeaderItem = {
    type: "date-header";
    id: string;
    headerText: string;
};

type HourHeaderItem = {
    type: "hour-header";
    id: string;
    headerText: string;
};

type TripItem = {
    type: "trip";
    id: string;
    tripInstance: TrpcRouterOutputs["tripInstance"]["getByRouteStopTime"][number];
    isActive?: boolean;
};

type RenderItem = LoaderItem | DateHeaderItem | HourHeaderItem | TripItem;

export const VirtualizedSchedule: React.FC<VirtualizedScheduleProps> = (props) => {
    const hasInitialized = useRef(false);
    const [currentViewingDate, setCurrentViewingDate] = useState<Date>(new Date());
    const [initialDate, setInitialDate] = useState<Date>(addHours(currentViewingDate, -3));
    const {
        data: tripInstancePages,
        fetchNextPage,
        fetchPreviousPage,
        isFetchingPreviousPage,
        isFetching,
        hasNextPage,
        hasPreviousPage,
    } = useBidirectionalTripInstancesByRouteStopTimes({
        agencyId: props.agencyId,
        routeId: props.routeId,
        stopId: props.stopId,
        directionId: props.directionId,
        initialDate: initialDate,
    });
    const tripsInstances = tripInstancePages?.pages.flat() ?? [];
    const [currentVisibleDate, setCurrentVisibleDate] = useState<Date>();
    const parentRef = useRef<HTMLDivElement>(null);

    const itemsToRender: RenderItem[] = (() => {
        const workingItems: RenderItem[] = [];

        if (hasPreviousPage) {
            workingItems.push({
                type: "loader",
                id: "previous-loader",
                direction: "previous",
            });
        }

        let prevTripDate: Date | null = null;
        for (const ti of tripsInstances) {
            const departureTime =
                ti.stop_time?.predicted_departure_datetime ?? ti.stop_time?.departure_datetime;

            // Add date header if date changes
            if (prevTripDate!?.getDate() !== departureTime?.getDate()) {
                const headerText = departureTime
                    ? format(departureTime, "PPPP")
                    : "No Departure Date";
                workingItems.push({
                    type: "date-header",
                    id: `header-${departureTime?.toISOString() ?? "unknown"}`,
                    headerText,
                });
            }

            // Add hour header if hour changes
            if (prevTripDate!?.getHours() !== departureTime?.getHours()) {
                const hourText = departureTime
                    ? format(startOfHour(departureTime), "p")
                    : "No Departure Time";
                workingItems.push({
                    type: "hour-header",
                    id: `hour-${departureTime?.toISOString() ?? "unknown"}`,
                    headerText: hourText,
                });
            }

            workingItems.push({
                type: "trip",
                id: ti._id! + "",
                tripInstance: ti as any,
                isActive: props.activeTripInstanceId === ti._id.toString(),
            });

            prevTripDate = departureTime ?? null;
        }

        if (hasNextPage) {
            workingItems.push({
                type: "loader",
                id: "next-loader",
                direction: "next",
            });
        }

        return workingItems;
    })();

    const virtualizer = useVirtualizer({
        count: itemsToRender.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 48,
        overscan: 5,
    });

    const virtualItems = virtualizer.getVirtualItems();

    // Scroll to the next upcoming trip on initial load.
    // Because first trip in data may NOT be the next upcoming trip (from preemptive loading of earlier trips).
    useEffect(() => {
        if (virtualizer && tripInstancePages && parentRef.current && !hasInitialized.current) {
            const stopTimeDiffs = tripsInstances
                .map((ti) => {
                    const st = ti.stop_time;
                    return st ? (st.predicted_departure_datetime ?? st.departure_datetime) : null;
                })
                .filter((time) => !!time)
                .map((time) => differenceInMilliseconds(time, currentViewingDate));
            const nextFutureTripIndex = stopTimeDiffs.findIndex((diff) => diff >= 0);
            const tripInstanceId = tripsInstances.at(nextFutureTripIndex)?._id + "";
            const renderItemIndex = itemsToRender.findIndex((item) => item.id === tripInstanceId);
            const indexWithOffset = renderItemIndex - 2; // Show a couple items before for context (either headers or prior trips)
            virtualizer.scrollToIndex(indexWithOffset, {
                align: "start",
            });
            hasInitialized.current = true;
        }
    }, [virtualizer, tripInstancePages]);

    // Sync current visible trip ID
    useEffect(() => {
        if (!tripsInstances.length) return;
        const midIndex = Math.floor(virtualItems.length / 2);
        const renderItem = itemsToRender[virtualItems[midIndex]?.index];
        if (renderItem && renderItem.type === "trip") {
            const tripInstance = renderItem.tripInstance;
            const stopTime = tripInstance?.stop_time;
            const departureTime =
                stopTime?.predicted_departure_datetime ?? stopTime?.departure_datetime;
            if (departureTime) setCurrentVisibleDate(departureTime);
        }
    }, [virtualItems, tripsInstances]);

    // Load more data when scrolling to the end
    useEffect(() => {
        if (isFetching || !hasInitialized.current) {
            return;
        }

        const [lastItem] = [...virtualizer.getVirtualItems()].reverse();
        if (!lastItem) {
            return;
        }

        if (lastItem.index >= itemsToRender.length - 1) {
            fetchNextPage();
        }
    }, [fetchNextPage, isFetching, itemsToRender.length, virtualizer.getVirtualItems()]);

    // Load previous data when scrolling to the start
    useEffect(() => {
        if (isFetching || !hasInitialized.current) {
            return;
        }

        const [firstItem] = virtualizer.getVirtualItems();
        if (!firstItem) {
            return;
        }

        if (firstItem.index === 0) {
            const scrollElement = parentRef.current;
            const prevScrollHeight = scrollElement?.scrollHeight ?? 0;
            fetchPreviousPage().then(() => {
                // Maintain scroll position. 2 frame delays to wait for React to re-render and virtualizer to measure.
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        setTimeout(() => {
                            if (scrollElement) {
                                const newScrollHeight = scrollElement.scrollHeight;
                                scrollElement.scrollTop += newScrollHeight - prevScrollHeight;
                            }
                        }, 0);
                    });
                });
            });
        }
    }, [fetchPreviousPage, isFetching, virtualizer.getVirtualItems(), parentRef.current]);

    const handleDatePickerChange = (date: Date | undefined) => {
        if (date) {
            console.log("Date picker changed to:", date);
            // Fully reset data to load around new date
            setCurrentViewingDate(date);
            setInitialDate(startOfDay(date));
            hasInitialized.current = false;
        }
    };

    const renderItem = (item: RenderItem) => {
        switch (item.type) {
            case "loader":
                return <LoadingRow direction={item.direction} />;
            case "date-header":
                return <DateHeaderRow headerText={item.headerText} />;
            case "hour-header":
                return <HourHeaderRow headerText={item.headerText} />;
            case "trip":
                return (
                    <TripInstanceRow tripInstance={item.tripInstance} isActive={item.isActive} />
                );
        }
    };

    return (
        <div className="space-y-4">
            <Card className="p-4 bg-primary/5">
                <div className="flex items-center justify-between">
                    <div>
                        <DatePickerDropdown
                            date={currentVisibleDate}
                            onDateChange={handleDatePickerChange}
                            label="Current Date"
                            variant="outline"
                        />
                    </div>
                    {isFetching && (
                        <div className="flex items-center gap-2">
                            <Spinner className="h-5 w-5" />
                            <span className="text-sm">
                                {isFetchingPreviousPage ? "Loading previous..." : "Loading next..."}
                            </span>
                        </div>
                    )}
                </div>
            </Card>

            <Card className="overflow-hidden bg-transparent">
                <div ref={parentRef} className="h-[50dvh] overflow-auto">
                    <div
                        style={{
                            height: `${virtualizer.getTotalSize()}px`,
                            width: "100%",
                            position: "relative",
                        }}
                    >
                        {virtualItems.map((virtualItem) => {
                            const item = itemsToRender[virtualItem.index];
                            return (
                                <div
                                    key={virtualItem.index}
                                    data-index={virtualItem.index}
                                    ref={virtualizer.measureElement}
                                    style={{
                                        position: "absolute",
                                        top: 0,
                                        left: 0,
                                        width: "100%",
                                        transform: `translateY(${virtualItem.start}px)`,
                                    }}
                                >
                                    {renderItem(item)}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </Card>
        </div>
    );
};

const TripInstanceRow: React.FC<{
    tripInstance: TrpcRouterOutputs["tripInstance"]["getByRouteStopTime"][number];
    isActive?: boolean;
}> = ({ tripInstance, isActive }) => {
    const stopTime = tripInstance.stop_time;
    const scheduledTime = stopTime?.departure_datetime;
    const predictedTime = stopTime?.predicted_departure_datetime;
    const departureTime = predictedTime ?? scheduledTime;

    const delayInSeconds =
        scheduledTime && predictedTime ? differenceInSeconds(predictedTime, scheduledTime) : null;

    return (
        <div
            className={cn(
                "px-4 py-3 border-b hover:bg-muted/50 transition-colors",
                isActive && "bg-muted/60"
            )}
        >
            <div className="flex items-center gap-5">
                <div className="relative">
                    <span className="font-medium">
                        {departureTime ? format(departureTime, "p") : "---"}
                    </span>
                    {delayInSeconds !== null && <RealTimeIndicator delaySeconds={delayInSeconds} className="-mt-1 -mr-3" />}
                </div>

                <span className="text-sm text-muted-foreground">
                    {tripInstance.trip?.trip_headsign}
                </span>
            </div>
        </div>
    );
};

const LoadingRow: React.FC<{ direction: "previous" | "next" }> = ({ direction }) => {
    return (
        <div className="px-4 py-3 border-b bg-secondary/70">
            <div className="font-medium">
                Loading {direction === "previous" ? "previous" : "more"} trips...
            </div>
        </div>
    );
};

const DateHeaderRow: React.FC<{ headerText: string }> = ({ headerText }) => {
    return (
        <div className="px-4 py-3 border-b bg-background/70">
            <div className="flex items-center justify-between">
                <span className="text-lg font-semibold">{headerText}</span>
            </div>
        </div>
    );
};

const HourHeaderRow: React.FC<{ headerText: string }> = ({ headerText }) => {
    return (
        <div className="px-4 py-2 border-b bg-muted/50">
            <div className="flex items-center h-full">
                <span className="text-sm text-muted-foreground">{headerText}</span>
            </div>
        </div>
    );
};
