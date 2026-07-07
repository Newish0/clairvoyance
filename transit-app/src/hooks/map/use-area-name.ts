import { inferAreaName } from "@/utils/infer-area-name";
import { useDebounceFn } from "ahooks";
import { useEffect, useState } from "react";
import { useMap, type LngLatBounds } from "react-map-gl/maplibre";
import { type PixelBounds } from "./use-selection-bbox";

/**
 * Live, debounced name of whatever place is centered in the selection
 * square - derived from the pmtiles `places` layer already rendered on
 * screen. No network calls, works fully offline.
 */
export function useAreaName(bounds: LngLatBounds | null, pixelBounds: PixelBounds | null) {
    const { current: map } = useMap();
    const [name, setName] = useState<string | null>(null);

    const { run: recomputeName } = useDebounceFn(
        () => {
            if (!bounds || !pixelBounds) return;
            setName(inferAreaName(map, pixelBounds, bounds));
        },
        { wait: 250 },
    );

    useEffect(recomputeName, [bounds, pixelBounds, recomputeName]);

    return name;
}
