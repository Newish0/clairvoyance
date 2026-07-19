import { trpcClient } from "@/main";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { Direction } from "database/models/enums";
import { addMilliseconds } from "date-fns";
import { useMemo } from "react";

type CursorPageParam = { cursor: Date; order: "asc" | "desc" };

export const useBidirectionalTripInstancesByRouteStopTimes = (props: {
    agencyId: string;
    routeId: number;
    stopId: number;
    direction?: Direction;
    initialDate?: Date;
    pageSize?: number;
}) => {
    const pageSize = props.pageSize ?? 30;
    const anchorDate = useMemo(() => props.initialDate ?? new Date(), [props.initialDate]);

    return useInfiniteQuery({
        queryKey: [
            "tripsInstancesScheduleByRouteStopTime",
            props.agencyId,
            props.routeId,
            props.stopId,
            props.direction,
            anchorDate.getTime(),
        ],

        queryFn: ({ pageParam }: { pageParam: CursorPageParam }) =>
            trpcClient.tripInstance.getDepartures.query({
                routeId: props.routeId,
                stopId: props.stopId,
                direction: props.direction,
                cursor: pageParam.cursor,
                order: pageParam.order,
                limit: pageSize,
            }),

        initialPageParam: {
            cursor: addMilliseconds(anchorDate, -1),
            order: "asc",
        } as CursorPageParam,

        // Fewer rows than asked for = genuinely out of data in that direction.
        // No time-window guessing left, so no gap can look like "the end."
        getNextPageParam: (lastPage) => {
            if (lastPage.length < pageSize) return undefined;
            return { cursor: lastPage.at(-1)!.effectiveTime!, order: "asc" as const };
        },
        getPreviousPageParam: (firstPage) => {
            if (firstPage.length < pageSize) return undefined;
            return { cursor: firstPage[0]!.effectiveTime!, order: "desc" as const };
        },
    });
};
