import { trpcClient } from "@/main";
import { useInfiniteQuery } from "@tanstack/react-query";
import { addHours, addSeconds } from "date-fns";
import { useState } from "react";
import type { Direction } from "../../../../gtfs-processor/shared/gtfs-db-types";

export const useBidirectionalTripInstancesByRouteStopTimes = (props: {
    agencyId: string;
    routeId: string;
    stopId: string;
    directionId?: Direction;
    initialDate?: Date;
    chunksSizeHours?: number;
}) => {
    const chunksSizeHours = props.chunksSizeHours ?? 12;
    const [initialDate] = useState(() => props.initialDate ?? new Date());
    const query = useInfiniteQuery({
        queryKey: [
            "tripsInstancesScheduleByRouteStopTime",
            props.agencyId,
            props.routeId,
            props.stopId,
            props.directionId,
        ],

        queryFn: async ({ pageParam }) => {
            const { startDate, endDate } = pageParam;

            return trpcClient.tripInstance.getByRouteStopTime.query({
                agencyId: props.agencyId,
                routeId: props.routeId,
                stopId: props.stopId,
                directionId: props.directionId,
                minDatetime: startDate,
                maxDatetime: endDate,
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
