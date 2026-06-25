import { useRequest } from "ahooks";
import { useEffect, useRef, useState } from "react";

export interface TileDataset {
    id: string;
    bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number };
    tiles: string;
    minZoom: number;
    maxZoom: number;
}

interface TileManifest {
    version: string;
    worldBase: string;
    datasets: TileDataset[];
}

const inBbox = (lon: number, lat: number, { bbox: b }: TileDataset) =>
    lon >= b.minLon && lon <= b.maxLon && lat >= b.minLat && lat <= b.maxLat;

const inZoom = (zoom: number, d: TileDataset) => zoom >= d.minZoom && zoom <= d.maxZoom;

export function useTileManifest(manifestUrl: string, lon: number, lat: number, zoom: number) {
    const { data } = useRequest<TileManifest, []>(() => fetch(manifestUrl).then((r) => r.json()), {
        cacheKey: manifestUrl,
    });
    const [activeTiles, setActiveTiles] = useState<string | null>(null);
    const activeRef = useRef<string | null>(null);

    useEffect(() => {
        if (!data) return;
        const { datasets, worldBase } = data;

        const match = datasets.find((d) => inBbox(lon, lat, d) && inZoom(zoom, d));
        // no match = outside bbox or zoomed out -> world-base
        const next = match ? match.tiles : worldBase;

        if (next !== activeRef.current) {
            activeRef.current = next;
            setActiveTiles(next);
        }
    }, [data, lon, lat, zoom]);

    return activeTiles;
}
