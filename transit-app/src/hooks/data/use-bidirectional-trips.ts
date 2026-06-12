import { trpcClient } from "@/main";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { Direction } from "database/models/enums";
import { addHours, addSeconds } from "date-fns";
import { useMemo } from "react";

export const useBidirectionalTripInstancesByRouteStopTimes = (props: {
    agencyId: string;
    routeId: number;
    stopId: number;
    direction?: Direction;
    initialDate?: Date;
    chunksSizeHours?: number;
}) => {
    const chunksSizeHours = props.chunksSizeHours ?? 12;
    const initialDate = useMemo(() => props.initialDate ?? new Date(), [props.initialDate]);

    const query = useInfiniteQuery({
        queryKey: [
            "tripsInstancesScheduleByRouteStopTime",
            props.agencyId,
            props.routeId,
            props.stopId,
            props.direction,
            initialDate.getTime(),
        ],

        queryFn: async ({ pageParam }) => {
            const { startDate, endDate } = pageParam;

            return trpcClient.tripInstance.getDepartures.query({
                routeId: props.routeId,
                stopId: props.stopId,
                direction: props.direction,
                from: startDate,
                to: endDate,
            });
        },

        initialPageParam: {
            startDate: initialDate,
            endDate: addHours(initialDate, chunksSizeHours),
        },

        // for scrolling UP (older data)
        getPreviousPageParam: (lastPage, _b, firstPageParam) => {
            if (lastPage.length === 0) return undefined; // Stop if no more data

            const endDate = addSeconds(firstPageParam.startDate, -1); // Ensure we don't overlap
            const startDate = addHours(endDate, -chunksSizeHours);
            return { startDate, endDate };
        },
        // for scrolling DOWN (newer data)
        getNextPageParam: (lastPage, _b, lastPageParam) => {
            if (lastPage.length === 0) return undefined; // Stop if no more data

            const startDate = addSeconds(lastPageParam.endDate, 1); // Ensure we don't overlap
            const endDate = addHours(startDate, chunksSizeHours);
            return { startDate, endDate };
        },
    });

    return query;
};
