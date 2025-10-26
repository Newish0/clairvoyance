import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useBidirectionalTripInstancesByRouteStopTimes } from "@/hooks/data/use-bidirectional-trips";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, useState } from "react";
import { Direction } from "../../../../gtfs-processor/shared/gtfs-db-types";
import { addHours, differenceInMilliseconds, format } from "date-fns";

type Props = {
    agencyId: string;
    routeId: string;
    stopId: string;
    directionId?: Direction;
};

export const InfiniteVirtualScroll: React.FC<Props> = (props) => {
    const hasInitialized = useRef(false);
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
        initialDate: addHours(new Date(), -3),
    });
    const tripsInstances = tripInstancePages?.pages.flat() ?? [];

    const [currentVisibleId, setCurrentVisibleId] = useState<string>();

    const parentRef = useRef<HTMLDivElement>(null);

    const virtualizer = useVirtualizer({
        count: tripsInstances.length + 2,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 48,
        overscan: 5,
    });

    const virtualItems = virtualizer.getVirtualItems();

    // Scroll to the next upcoming trip on initial load.
    // Because first trip in data may NOT be the next upcoming trip (from preemptive loading of earlier trips).
    useEffect(() => {
        if (virtualizer && tripInstancePages && parentRef.current && !hasInitialized.current) {
            const now = new Date();
            const stopTimeDiffs = tripsInstances
                .map((ti) => {
                    const st = ti.stop_times.find((st) => st.stop_id === props.stopId);
                    return st ? (st.predicted_departure_datetime ?? st.departure_datetime) : null;
                })
                .filter((time) => !!time)
                .map((time) => differenceInMilliseconds(time, now));
            const nextFutureTripIndex = stopTimeDiffs.findIndex((diff) => diff >= 0);
            const correctedIndex = nextFutureTripIndex + 1; // Adjust for prev loader row
            virtualizer.scrollToIndex(correctedIndex, {
                align: "start",
            });
            hasInitialized.current = true;
        }
    }, [virtualizer, tripInstancePages]);

    // Sync current visible trip ID
    useEffect(() => {
        if (virtualItems.length > 0 && tripsInstances[virtualItems[0].index]) {
            setCurrentVisibleId(tripsInstances[virtualItems[0].index]._id + "");
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

        if (lastItem.index >= tripsInstances.length) {
            fetchNextPage();
        }
    }, [fetchNextPage, isFetching, tripsInstances.length, virtualizer.getVirtualItems()]);

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
                        if (scrollElement) {
                            const newScrollHeight = scrollElement.scrollHeight;
                            scrollElement.scrollTop += newScrollHeight - prevScrollHeight;
                        }
                    });
                });
            });
        }
    }, [
        fetchPreviousPage,
        isFetching,
        tripsInstances.length,
        virtualizer.getVirtualItems(),
        parentRef.current,
    ]);

    return (
        <div className="space-y-4">
            <Card className="p-4 bg-primary text-primary-foreground">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium">Current Position</p>
                        <p className="text-2xl font-bold">
                            {currentVisibleId !== null
                                ? `ID: ${currentVisibleId?.slice(currentVisibleId.length - 5)}`
                                : "Loading..."}
                        </p>
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

            <Card className="overflow-hidden">
                <div ref={parentRef} className="h-[600px] overflow-auto">
                    <div
                        style={{
                            height: `${virtualizer.getTotalSize()}px`,
                            width: "100%",
                            position: "relative",
                        }}
                    >
                        {virtualItems.map((virtualItem) => {
                            const isLoaderRow =
                                virtualItem.index === 0 ||
                                virtualItem.index > tripsInstances.length; // First or last row
                            const tripInstance = tripsInstances.at(virtualItem.index - 1); // Adjust for prev loader row

                            const stopTime = tripInstance?.stop_times.find(
                                (st) => st.stop_id === props.stopId
                            );
                            const departureTime =
                                stopTime?.predicted_departure_datetime ??
                                stopTime?.departure_datetime;

                            return (
                                <div
                                    key={virtualItem.index}
                                    style={{
                                        position: "absolute",
                                        top: 0,
                                        left: 0,
                                        width: "100%",
                                        height: `${virtualItem.size}px`,
                                        transform: `translateY(${virtualItem.start}px)`,
                                    }}
                                >
                                    <div className="px-4 py-3 border-b hover:bg-muted/50 transition-colors">
                                        <div className="flex items-center justify-between">
                                            {isLoaderRow ? (
                                                <div className="font-medium">
                                                    Loading more trips...
                                                </div>
                                            ) : (
                                                <span className="font-medium">
                                                    {departureTime
                                                        ? format(departureTime, "PPp")
                                                        : "---"}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </Card>
        </div>
    );
};
