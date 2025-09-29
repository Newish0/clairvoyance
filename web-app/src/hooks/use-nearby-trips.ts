import { debounce, leading, throttle, type Scheduled } from "@solid-primitives/scheduled";
import { createEffect, createResource, on, onCleanup, onMount, type Accessor } from "solid-js";
import { getNearbyTrips } from "~/services/trips";

type Params = {
    latitude: number;
    longitude: number;
    radius: number;
    isAttached: boolean;
};

type Options = {
    changeDebounce: number;
    changeThrottle: number;
    refetchInterval: number;
    clockUpdateInterval: number;
};

export const useNearbyTrips = (params: Accessor<Params>, options: Options) => {
    // Use custom refetch function so only the initial load is in suspense state.
    // This is so that the skeletons don't show win subsequent refetches.
    const [nearbyTrips, { mutate }] = createResource(() =>
        getNearbyTrips({
            latitude: params().latitude,
            longitude: params().longitude,
            radius: params().radius,
        })
    );

    const throttledRefetch = leading(
        throttle,
        () =>
            getNearbyTrips({
                latitude: params().latitude,
                longitude: params().longitude,
                radius: params().radius,
            }).then(mutate),
        options.changeThrottle
    );

    const debouncedRefetch = debounce(() => {
        getNearbyTrips({
            latitude: params().latitude,
            longitude: params().longitude,
            radius: params().radius,
        }).then(mutate);
    }, options.changeDebounce);

    createEffect(
        on([params], ([params]) => {
            if (nearbyTrips.loading) return;

            if (params.isAttached) {
                throttledRefetch();
            } else {
                debouncedRefetch();
            }
        })
    );

    let clockUpdateInterval: null | ReturnType<typeof setInterval> = null;
    let refetchInterval: null | ReturnType<typeof setInterval> = null;

    onMount(() => {
        clockUpdateInterval = setInterval(() => {
            mutate(nearbyTrips());
        }, options.clockUpdateInterval);
        refetchInterval = setInterval(() => {
            debouncedRefetch();
        }, options.refetchInterval);
    });

    onCleanup(() => {
        if (clockUpdateInterval) clearInterval(clockUpdateInterval);
        if (refetchInterval) clearInterval(refetchInterval);
    });

    return nearbyTrips;
};
