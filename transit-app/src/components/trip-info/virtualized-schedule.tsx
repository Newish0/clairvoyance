import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useBidirectionalTripInstancesByRouteStopTimes } from "@/hooks/data/use-bidirectional-trips";
import { cn } from "@/lib/utils";
import type { TrpcRouterOutputs } from "@/main";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Direction } from "database/models/enums";
import {
    addHours,
    differenceInMilliseconds,
    differenceInSeconds,
    format,
    startOfDay,
    startOfHour,
} from "date-fns";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { DatePickerDropdown } from "../ui/date-picker-dropdown";
import { RealTimeIndicator } from "../ui/realtime-indicator";
import { Link } from "@tanstack/react-router";

type VirtualizedScheduleProps = {
    agencyId: string;
    routeId: number;
    stopId: number;
    direction?: Direction;
    activeTripInstanceId?: number;
};

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
    departure: TrpcRouterOutputs["tripInstance"]["getDepartures"][number];
    isActive?: boolean;
};

type RenderItem = LoaderItem | DateHeaderItem | HourHeaderItem | TripItem;

export const VirtualizedSchedule: React.FC<VirtualizedScheduleProps> = (props) => {
    const [currentViewingDate, setCurrentViewingDate] = useState<Date>(new Date());
    const [initialDate, setInitialDate] = useState<Date>(addHours(currentViewingDate, -3));

    // Ref so toggling it doesn't re-render
    const hasScrolledToNow = useRef(false);

    const {
        data: departurePages,
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
        direction: props.direction,
        initialDate: initialDate,
    });

    const departures = departurePages?.pages.flat() ?? [];
    const [currentVisibleDate, setCurrentVisibleDate] = useState<Date>();
    const parentRef = useRef<HTMLDivElement>(null);

    // Flat list with date/hour headers inserted whenever the value changes
    const itemsToRender: RenderItem[] = (() => {
        const items: RenderItem[] = [];

        if (hasPreviousPage) {
            items.push({ type: "loader", id: "previous-loader", direction: "previous" });
        }

        let prevEffectiveTime: Date | null = null;

        for (const d of departures) {
            if (prevEffectiveTime!?.getDate() !== d.effectiveTime?.getDate()) {
                items.push({
                    type: "date-header",
                    id: `date-header-${d.effectiveTime?.toISOString() ?? "unknown"}`,
                    headerText: d.effectiveTime ? format(d.effectiveTime, "PPPP") : "No date",
                });
            }

            if (prevEffectiveTime!?.getHours() !== d.effectiveTime?.getHours()) {
                items.push({
                    type: "hour-header",
                    id: `hour-header-${d.effectiveTime?.toISOString() ?? "unknown"}`,
                    headerText: d.effectiveTime
                        ? format(startOfHour(d.effectiveTime), "p")
                        : "No time",
                });
            }

            items.push({
                type: "trip",
                id: String(d.tripInstanceId),
                departure: d as any,
                isActive: props.activeTripInstanceId === d.tripInstanceId,
            });

            prevEffectiveTime = d.effectiveTime ?? null;
        }

        if (hasNextPage) {
            items.push({ type: "loader", id: "next-loader", direction: "next" });
        }

        return items;
    })();

    const virtualizer = useVirtualizer({
        count: itemsToRender.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 48,
        overscan: 5,
        // Stable item identity across prepends. Without this, every index shifts
        // on prepend and the virtualizer can't track what was on screen.
        getItemKey: (index) => itemsToRender[index]?.id ?? index,
        // End-anchored mode (TanStack Virtual v3, May 2026): when items are prepended,
        // the virtualizer finds the same keyed item and adjusts scrollTop automatically.
        // No manual scroll math needed.
        anchorTo: "end",
    });

    const virtualItems = virtualizer.getVirtualItems();

    // Scroll to the next upcoming trip on first load. useLayoutEffect so it
    // happens before paint - no flash of the top of the list.
    useLayoutEffect(() => {
        if (!departurePages || !parentRef.current || hasScrolledToNow.current) return;

        const nextTripIndex = departures.findIndex(
            (d) =>
                d.effectiveTime &&
                differenceInMilliseconds(d.effectiveTime, currentViewingDate) >= 0,
        );

        if (nextTripIndex === -1) return;

        const tripId = String(departures[nextTripIndex]?.tripInstanceId);
        const renderIndex = itemsToRender.findIndex((item) => item.id === tripId);

        if (renderIndex === -1) return;

        // Back up 2 so the user sees a header or the prior trip for context
        virtualizer.scrollToIndex(Math.max(0, renderIndex - 2), { align: "start" });
        hasScrolledToNow.current = true;
    }, [departurePages]);

    // Keep the date picker in sync with whatever's in the middle of the viewport
    useEffect(() => {
        if (!departures.length) return;
        const mid = itemsToRender[virtualItems[Math.floor(virtualItems.length / 2)]?.index];
        if (mid?.type === "trip" && mid.departure.effectiveTime) {
            setCurrentVisibleDate(mid.departure.effectiveTime);
        }
    }, [virtualItems, departures]);

    // Fetch next page when the last rendered item is the last item in the list
    useEffect(() => {
        if (isFetching || !hasScrolledToNow.current) return;
        const lastItem = virtualItems.at(-1);
        if (lastItem && lastItem.index >= itemsToRender.length - 1 && hasNextPage) {
            fetchNextPage();
        }
    }, [fetchNextPage, isFetching, hasNextPage, itemsToRender.length, virtualItems]);

    // Fetch previous page when close to the top. index <= 2 instead of === 0
    // so we trigger slightly before the user hits the loader row (overscan: 5
    // keeps index 0 rendered well before it's visible).
    // Scroll restoration is handled by anchorTo: 'end' above - no manual math.
    useEffect(() => {
        if (isFetching || !hasScrolledToNow.current) return;
        const firstItem = virtualItems[0];
        if (firstItem && firstItem.index <= 2 && hasPreviousPage) {
            fetchPreviousPage();
        }
    }, [fetchPreviousPage, isFetching, hasPreviousPage, virtualItems]);

    const handleDatePickerChange = (date: Date | undefined) => {
        if (!date) return;
        setCurrentViewingDate(date);
        setInitialDate(startOfDay(date));
        hasScrolledToNow.current = false; // re-run the initial scroll for the new date
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
                    <TripInstanceRow
                        departure={item.departure}
                        isActive={item.isActive}
                        {...props}
                    />
                );
        }
    };

    return (
        <div className="space-y-4">
            <Card className="p-4 bg-primary/5">
                <div className="flex items-center justify-between">
                    <DatePickerDropdown
                        date={currentVisibleDate}
                        onDateChange={handleDatePickerChange}
                        label="Current Date"
                        variant="outline"
                    />
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
                                    key={virtualItem.key} // key from getItemKey, not the array index
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
    departure: TrpcRouterOutputs["tripInstance"]["getDepartures"][number];
    isActive?: boolean;
    agencyId: string;
    routeId: number;
    stopId: number;
    direction?: Direction;
}> = ({ departure, isActive, ...props }) => {
    const scheduledTime = departure.scheduledDepartureTime ?? departure.scheduledArrivalTime;
    const predictedTime = departure.predictedDepartureTime ?? departure.predictedArrivalTime;
    const delayInSeconds =
        scheduledTime && predictedTime ? differenceInSeconds(predictedTime, scheduledTime) : null;

    return (
        <Link
            to="/nt"
            replace
            search={{
                agencyId: props.agencyId,
                routeId: props.routeId,
                stopId: props.stopId,
                direction: props.direction,
                stopSequence: departure.stopSequence,
                tripInstanceId: departure.tripInstanceId,
            }}
        >
            <div
                className={cn(
                    "px-4 py-3 border-b hover:bg-muted/50 transition-colors",
                    isActive && "bg-muted/60",
                )}
            >
                <div className="flex items-center gap-5">
                    <div className="relative">
                        <span
                            className={cn("font-medium", {
                                "line-through text-muted-foreground":
                                    departure.scheduleRelationship === "SKIPPED",
                            })}
                        >
                            {departure.effectiveTime ? format(departure.effectiveTime, "p") : "---"}
                        </span>
                        {delayInSeconds !== null && (
                            <RealTimeIndicator
                                delaySeconds={delayInSeconds}
                                className="-mt-1 -mr-3"
                            />
                        )}
                    </div>
                    <span className="text-sm text-muted-foreground">{departure.tripHeadsign}</span>
                </div>
            </div>
        </Link>
    );
};

const LoadingRow: React.FC<{ direction: "previous" | "next" }> = ({ direction }) => (
    <div className="px-4 py-3 border-b bg-secondary/70">
        <div className="font-medium">
            Loading {direction === "previous" ? "previous" : "more"} trips...
        </div>
    </div>
);

const DateHeaderRow: React.FC<{ headerText: string }> = ({ headerText }) => (
    <div className="px-4 py-3 border-b bg-background/70">
        <span className="text-lg font-semibold">{headerText}</span>
    </div>
);

const HourHeaderRow: React.FC<{ headerText: string }> = ({ headerText }) => (
    <div className="px-4 py-2 border-b bg-muted/50">
        <span className="text-sm text-muted-foreground">{headerText}</span>
    </div>
);
