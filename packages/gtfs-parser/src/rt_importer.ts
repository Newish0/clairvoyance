import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import fetch from "node-fetch";

interface Long {
    low: number;
    high: number;
    unsigned: boolean;
}

// Function to convert Long to number
export function longToNumber(long: Long): number {
    if (long.unsigned) {
        return long.high * Math.pow(2, 32) + (long.low >>> 0);
    } else {
        return long.high * Math.pow(2, 32) + long.low;
    }
}

/**
 * Imports a GTFS Realtime feed from a URL.\
 * **Note:** This function has very different semantics compared to `importGtfs`.
 * @param params - Object with a single property `url` containing the URL of the GTFS Realtime feed to import.
 * @returns The decoded GTFS Realtime feed.
 */
export async function importOneGtfsRt({ url }: { url: string }) {
    const res = await fetch(url, {});
    if (!res.ok) {
        const error = new Error(`${res.url}: ${res.status} ${res.statusText}`);
        throw error;
    }

    const buffer = await res.arrayBuffer();
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
    return feed;
}

/**
 * Imports multiple GTFS Realtime feeds from a list of URLs.
 * **Note:** This function has very different semantics compared to `importGtfs`.
 * @param  params - Array of objects with a single property `url` containing the URL of the GTFS Realtime feed to import.
 * @returns  Array of decoded GTFS Realtime feeds.
 */
export async function importGtfsRt({ url }: { url: string | string[] }) {
    let urlsToImport: string[] = [];
    if (!Array.isArray(url)) {
        urlsToImport = [url];
    } else {
        urlsToImport = url;
    }

    const feeds = await Promise.all(urlsToImport.map((url) => importOneGtfsRt({ url })));
    return feeds;
}
