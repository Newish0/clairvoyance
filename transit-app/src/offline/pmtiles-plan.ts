import { PMTiles, type Header, type RangeResponse, type Source } from "pmtiles";
import { IdbSource } from "./pmtiles-source";

// Reuses the official `pmtiles` client for all format/hilbert/directory logic.
// We only intercept getBytes() to record which ranges it asks for.

class RecordingSource implements Source {
    ranges: { offset: number; length: number }[] = [];
    constructor(private inner: Source) {}
    getKey() {
        return this.inner.getKey();
    }
    async getBytes(
        offset: number,
        length: number,
        signal?: AbortSignal,
        etag?: string,
    ): Promise<RangeResponse> {
        this.ranges.push({ offset, length });
        return this.inner.getBytes(offset, length, signal, etag);
    }
}

function mergeRanges(
    ranges: { offset: number; length: number }[],
    maxGap = 0,
): { offset: number; length: number }[] {
    const sorted = [...ranges].sort((a, b) => a.offset - b.offset);
    const out: { offset: number; length: number }[] = [];
    for (const r of sorted) {
        const prev = out[out.length - 1];
        if (prev && r.offset <= prev.offset + prev.length + maxGap) {
            prev.length = Math.max(prev.length, r.offset + r.length - prev.offset);
        } else {
            out.push({ ...r });
        }
    }
    return out;
}

function bboxToTileRange(
    z: number,
    [minLon, minLat, maxLon, maxLat]: [number, number, number, number],
) {
    const toTile = (lon: number, lat: number) => {
        const n = 2 ** z;
        const x = Math.floor(((lon + 180) / 360) * n);
        const rad = (lat * Math.PI) / 180;
        const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
        return [Math.max(0, Math.min(n - 1, x)), Math.max(0, Math.min(n - 1, y))];
    };
    const [xMin, yMin] = toTile(minLon, maxLat);
    const [xMax, yMax] = toTile(maxLon, minLat);
    return { xMin, xMax, yMin, yMax };
}

/**
 * Plan (and cache) the byte ranges needed to render a bbox offline.
 *
 * Uses RecordingSource(IdbSource) so every getBytes() call both records
 * the range AND stores the data in IndexedDB. After this completes, the
 * PMTiles instance can be registered with protocol.add() for offline use.
 *
 * @param url    - Full URL to the pmtiles file (e.g. "./pmtiles/TL.pmtiles")
 * @param bbox   - [west, south, east, north]
 * @param minZoom
 * @param maxZoom
 * @param mergeGapBytes - Merge ranges whose gap ≤ this threshold (0 = only adjacent)
 */
export async function planRanges(
    url: string,
    bbox: [number, number, number, number],
    minZoom: number,
    maxZoom: number,
    mergeGapBytes = 0,
): Promise<{ header: Header; ranges: { offset: number; length: number }[] }> {
    const inner = new IdbSource(url);
    const source = new RecordingSource(inner);
    const pm = new PMTiles(source);
    const header = await pm.getHeader(); // also warms root dir cache -> recorded

    for (let z = Math.max(minZoom, header.minZoom); z <= Math.min(maxZoom, header.maxZoom); z++) {
        const { xMin, xMax, yMin, yMax } = bboxToTileRange(z, bbox);
        for (let x = xMin; x <= xMax; x++) {
            for (let y = yMin; y <= yMax; y++) {
                // library handles directory walk, leaf-dir caching, dedup
                await pm.getZxy(z, x, y);
            }
        }
    }

    return {
        header,
        ranges: mergeRanges(source.ranges, mergeGapBytes),
    };
}
