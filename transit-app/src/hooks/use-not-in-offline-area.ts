import { useMemo } from "react";
import { useOfflineAreas } from "./use-offline-areas";
import { useOfflineMode } from "./use-offline-mode";
import { useOnlineStatus } from "./use-online-status";
import { isPointInBbox } from "@/utils/geo";

export function useNotInOfflineArea(center: { lat: number; lng: number } | null): boolean {
    const [offlineModeEnabled] = useOfflineMode();
    const { isOnline } = useOnlineStatus();
    const { areas } = useOfflineAreas();

    return useMemo(() => {
        if (!offlineModeEnabled) return false;
        if (isOnline) return false;
        if (!center) return false;

        const downloadedAreas = areas.filter((a) => a.state === "downloaded");
        const insideAny = downloadedAreas.some((a) => isPointInBbox(center, a.bbox));
        return !insideAny;
    }, [offlineModeEnabled, isOnline, center, areas]);
}
