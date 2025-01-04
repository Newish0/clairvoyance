import { type Component, createEffect, createResource, For } from "solid-js";
import { ArrivalRow } from "./arrival-row";
import { createMemo } from "solid-js";
import { getNearbyTransits } from "~/services/gtfs/transit";
import type { NearbyResponse } from "~/services/gtfs/types";
import { useStore } from "@nanostores/solid";
import { $userLocation } from "~/stores/user-location-store";

import { debounce } from "@solid-primitives/scheduled";
import { getArrivalMinutes } from "~/utils/time";

export const ArrivalBoard: Component = () => {
    const userLocation = useStore($userLocation);
    const [nearbyTransits] = createResource(
        // NOTE: Must explicitly specify each object field to get update to work
        () => ({
            lat: userLocation().current.lat,
            lon: userLocation().current.lon,
        }),
        (currentLoc) => {
            return new Promise<Awaited<ReturnType<typeof getNearbyTransits>>>((resolve, reject) => {
                const scheduled = debounce(
                    () =>
                        getNearbyTransits({
                            lat: currentLoc.lat,
                            lon: currentLoc.lon,
                            radius: 1,
                        })
                            .then(resolve)
                            .catch(reject),
                    250
                );

                scheduled();
            });
        }
    );

    const groupedEntries = createMemo(
        () =>
            nearbyTransits()?.reduce((group, info) => {
                if (!group[info.route.id]) group[info.route.id] = [];
                group[info.route.id].push(info);
                return group;
            }, {} as Record<string, NearbyResponse[]>) ?? []
    );

    const sortedEntries = createMemo(() =>
        Object.entries(groupedEntries()).toSorted((groupA, groupB) => {
            const entriesA = groupA[1];
            const entriesB = groupB[1];

            const computeScore = (nearbyRes: NearbyResponse) => {
                const { route, trip, stop, stop_time } = nearbyRes;
                const arrivalMinutes = getArrivalMinutes(
                    stop_time.arrival_time,
                    stop_time.arrival_delay ?? 0
                );
                return arrivalMinutes + (Math.E ** (60 * stop.distance) - 1);
            };

            entriesA.sort((a, b) => computeScore(a) - computeScore(b));
            entriesB.sort((a, b) => computeScore(a) - computeScore(b));

            const scoreA = computeScore(entriesA[0]);
            const scoreB = computeScore(entriesB[0]);

            return scoreA - scoreB;
        })
    );

    return (
        <div class="w-full mx-auto space-y-2">
            <For each={sortedEntries()}>{([_, entries]) => <ArrivalRow entries={entries} />}</For>
        </div>
    );
};
