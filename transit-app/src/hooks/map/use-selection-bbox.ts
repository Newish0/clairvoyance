import { useEffect, useState } from "react";
import { useMap } from "react-map-gl/maplibre";
import { useMemoizedFn } from "ahooks";
import { LngLatBounds } from "maplibre-gl";

export type PixelBounds = [[number, number], [number, number]];

/**
 * Tracks a square region, fixed in screen-space and centered on the map
 * container, sized as `min(width, height) - 2 * marginPx`. Returns the
 * live geographic bbox for that square plus its pixel size (for rendering
 * the overlay square itself).
 */
export function useSelectionBbox(marginPx: number) {
    const { current: map } = useMap();
    const [bounds, setBounds] = useState<LngLatBounds | null>(null);
    const [squareSizePx, setSquareSizePx] = useState(0);
    const [pixelBounds, setPixelBounds] = useState<PixelBounds | null>(null);

    const recompute = useMemoizedFn(() => {
        if (!map) return;
        const { width, height } = map.getContainer().getBoundingClientRect();
        const side = Math.max(Math.min(width, height) - marginPx * 2, 0);
        setSquareSizePx(side);

        const cx = width / 2;
        const cy = height / 2;
        const half = side / 2;
        const nwPx: [number, number] = [cx - half, cy - half];
        const sePx: [number, number] = [cx + half, cy + half];
        setPixelBounds([nwPx, sePx]);

        const sw = map.unproject([cx - half, cy + half]);
        const ne = map.unproject([cx + half, cy - half]);
        setBounds(new LngLatBounds(sw, ne));
    });

    useEffect(() => {
        if (!map) return;
        recompute();
        map.on("move", recompute);
        map.on("resize", recompute);
        const ro = new ResizeObserver(recompute);
        ro.observe(map.getContainer());
        return () => {
            map.off("move", recompute);
            map.off("resize", recompute);
            ro.disconnect();
        };
    }, [map, recompute]);

    return { bounds, squareSizePx, pixelBounds };
}
