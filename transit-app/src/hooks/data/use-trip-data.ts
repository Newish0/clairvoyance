import { trpcOptions } from "@/main";
import type { QueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import type { Direction } from "database/models/enums";
import { useMemo } from "react";

const STALE_TIME = 30_000;
const GC_TIME = 30_000;
const REFETCH_INTERVAL = 30_000;

export type UseTripDataParams = {
    agencyId: string;
    stopId: number;
    routeId: number;
    direction?: Direction;
    tripInstanceId?: number;
};

export async function prefetchTripData(params: UseTripDataParams, qc: QueryClient) {
    const { agencyId, stopId, routeId, direction, tripInstanceId: explicitTripId } = params;

    const upcomingOpts = trpcOptions.tripInstance.getUpcomingDepartures.queryOptions({
        stopId,
        routeId,
        direction,
        limit: 5,
    });
    await qc.prefetchQuery({ ...upcomingOpts, staleTime: STALE_TIME, gcTime: GC_TIME });

    const upcomingData = qc.getQueryData(upcomingOpts.queryKey);
    const resolvedTripId = explicitTripId ?? upcomingData?.[0]?.tripInstanceId;
    if (!resolvedTripId) return;

    const tripOpts = trpcOptions.tripInstance.getById.queryOptions(resolvedTripId);
    await qc.prefetchQuery({ ...tripOpts, staleTime: STALE_TIME, gcTime: GC_TIME });

    const tripData = qc.getQueryData(tripOpts.queryKey);
    if (!tripData) return;

    const stopIds = tripData.stopTimeInstances
        .map((st: { stopId: number | null }) => st.stopId)
        .filter((id: number | null): id is number => id !== null);
    const routeType = tripData.trip?.route?.type;

    if (stopIds.length > 0) {
        await qc.prefetchQuery({
            ...trpcOptions.alert.getAlertForTripInstance.queryOptions({
                agencyId,
                routeId,
                direction,
                stopIds,
                tripInstanceId: resolvedTripId,
                routeType,
            }),
            staleTime: STALE_TIME,
            gcTime: GC_TIME,
        });
    }
}

export function useTripData(params: UseTripDataParams) {
    const { agencyId, stopId, routeId, direction, tripInstanceId: explicitTripId } = params;

    const upcomingQuery = useQuery({
        ...trpcOptions.tripInstance.getUpcomingDepartures.queryOptions({
            stopId,
            routeId,
            direction,
            limit: 5,
        }),
        staleTime: STALE_TIME,
        gcTime: GC_TIME,
        refetchInterval: REFETCH_INTERVAL,
        placeholderData: (prev) => prev,
    });

    const resolvedTripInstanceId = explicitTripId ?? upcomingQuery.data?.[0]?.tripInstanceId;

    const tripQuery = useQuery({
        ...trpcOptions.tripInstance.getById.queryOptions(resolvedTripInstanceId!),
        staleTime: STALE_TIME,
        gcTime: GC_TIME,
        refetchInterval: REFETCH_INTERVAL,
        enabled: resolvedTripInstanceId !== undefined,
    });

    const targetStopTimeInstIdx = useMemo(
        () => tripQuery.data?.stopTimeInstances.findIndex((st) => st.stopId === stopId) ?? -1,
        [tripQuery.data, stopId],
    );

    const stopIds = useMemo(
        () =>
            tripQuery.data?.stopTimeInstances.map((st) => st.stopId).filter((id) => id !== null) ??
            [],
        [tripQuery.data],
    );

    const routeType = useMemo(() => tripQuery.data?.trip?.route?.type, [tripQuery.data]);

    const alertsQuery = useQuery({
        ...trpcOptions.alert.getAlertForTripInstance.queryOptions({
            agencyId,
            routeId,
            direction,
            stopIds,
            tripInstanceId: resolvedTripInstanceId!,
            routeType,
        }),
        staleTime: STALE_TIME,
        gcTime: GC_TIME,
        refetchInterval: REFETCH_INTERVAL,
        enabled: !!tripQuery.data && stopIds.length > 0 && resolvedTripInstanceId !== undefined,
    });

    const stopAlerts = useMemo(
        () =>
            alertsQuery.data?.filter((a) => a.informedEntities?.some((e) => e.stopId !== null)) ??
            [],
        [alertsQuery.data],
    );

    const otherAlerts = useMemo(
        () =>
            alertsQuery.data?.filter((a) => a.informedEntities?.some((e) => e.stopId === null)) ??
            [],
        [alertsQuery.data],
    );

    const isLoading = upcomingQuery.isLoading || tripQuery.isLoading || alertsQuery.isLoading;

    const error = upcomingQuery.error ?? tripQuery.error ?? alertsQuery.error;

    return {
        upcomingDepartures: upcomingQuery.data ?? [],
        targetTripInst: tripQuery.data,
        targetStopTimeInstIdx,
        stopAlerts,
        otherAlerts,
        isLoading,
        error,
    };
}
