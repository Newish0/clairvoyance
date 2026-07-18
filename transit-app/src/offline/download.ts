import { pmtilesProtocol, trpcClient } from "@/main";
import { getDb } from "@/offline/db";
import { saveOfflineData } from "@/offline/manage";
import { planRanges } from "@/offline/pmtiles-plan";
import { IdbSource } from "@/offline/pmtiles-source";
import { addDays, startOfDay } from "date-fns";
import { PMTiles } from "pmtiles";

export type DownloadResult = {
    sizeBytes: number;
    tilesUrl?: string;
    tileRanges?: number;
    tileBytes?: number;
    dateRange: [number, number]; // epoch ms [start, end] - the range actually used
};

/**
 * Fetch area data from server, upsert into PGlite, cache tiles to IDB.
 * Throws on failure - caller handles state transitions.
 */
export async function executeAreaDownload(
    bbox: [[number, number], [number, number]],
    dateRange?: [Date, Date],
): Promise<DownloadResult> {
    const [start, end] = dateRange ?? [startOfDay(new Date()), addDays(startOfDay(new Date()), 2)];

    const data = await trpcClient.offlineSync.getArea.query({
        bounds: bbox,
        dateRange: [start, end],
    });

    const db = await getDb();
    await saveOfflineData(db, data);

    const bboxFlat: [number, number, number, number] = [
        bbox[0][0],
        bbox[0][1],
        bbox[1][0],
        bbox[1][1],
    ];

    const manifestUrl = `${import.meta.env.BASE_URL}pmtiles/manifest.json`;
    const manifest = await fetch(manifestUrl).then((r) => r.json());
    const centerLon = (bbox[0][0] + bbox[1][0]) / 2;
    const centerLat = (bbox[0][1] + bbox[1][1]) / 2;
    const dataset = manifest.datasets.find(
        (d: any) =>
            centerLon >= d.bbox.minLon &&
            centerLon <= d.bbox.maxLon &&
            centerLat >= d.bbox.minLat &&
            centerLat <= d.bbox.maxLat,
    );

    let tilesUrl: string | undefined;
    let tileRanges: { length: number }[] | undefined;

    // ponytail: world-base too large to cache (45MB+), skip if no dataset matches
    if (dataset) {
        tilesUrl = `${import.meta.env.BASE_URL}${dataset.tiles}`;
        const result = await planRanges(tilesUrl, bboxFlat, Math.max(10, dataset.minZoom), 16);
        tileRanges = result.ranges;
        pmtilesProtocol.add(new PMTiles(new IdbSource(tilesUrl)));
    }

    const dataBytes = new TextEncoder().encode(JSON.stringify(data)).length;
    const tileBytes = tileRanges?.reduce((s, r) => s + r.length, 0) ?? 0;

    return {
        sizeBytes: dataBytes + tileBytes,
        tilesUrl,
        tileRanges: tileRanges?.length,
        tileBytes,
        dateRange: [start.getTime(), end.getTime()],
    };
}
