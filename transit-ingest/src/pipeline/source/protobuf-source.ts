import { CryptoHasher } from "bun";
import type { Context } from "../core/context";
import type { ItemResult } from "../core/error";
import { fatalError, itemOk } from "../core/error";
import type { Source } from "../core/pipe";

export interface ProtobufData {
    bytes: Uint8Array;
    hash: string;
}

/**
 * Headers cached after a successful fetch, used for conditional requests
 * on the next poll cycle to avoid re-downloading unchanged content.
 */
export interface CachedHeaders {
    etag?: string;
    lastModified?: string;
}

export class ProtobufSource implements Source<ProtobufData> {
    constructor(private data: ProtobufData) {}

    async *run(_ctx: Context): AsyncIterable<ItemResult<ProtobufData>> {
        yield itemOk(this.data);
    }
}

export type FetchProtobufResult =
    | { changed: true; data: ProtobufData; cachedHeaders: CachedHeaders }
    | { changed: false };

/**
 * Fetch protobuf bytes, using conditional HTTP headers (ETag / Last-Modified)
 * to skip re-downloading when the server signals the content hasn't changed.
 *
 * Returns `{ changed: false }` when:
 *   - Server responds 304 Not Modified (conditional headers supported), or
 *   - Server responds 200 but SHA-256 hash matches the previous hash (fallback dedup).
 *
 * The caller should persist `cachedHeaders` from each successful fetch and pass
 * them back on the next call so conditional requests can be made.
 */
export async function fetchProtobuf(
    url: string,
    signal: AbortSignal,
    prevHash?: string,
    prevCachedHeaders?: CachedHeaders,
): Promise<FetchProtobufResult> {
    const headers: Record<string, string> = {
        Accept: "application/octet-stream, application/x-protobuf, */*",
    };

    if (prevCachedHeaders?.etag) {
        headers["If-None-Match"] = prevCachedHeaders.etag;
    } else if (prevCachedHeaders?.lastModified) {
        // Only fall back to Last-Modified if no ETag - ETag is more reliable
        headers["If-Modified-Since"] = prevCachedHeaders.lastModified;
    }

    const response = await fetch(url, { signal, headers });

    if (response.status === 304) {
        return { changed: false };
    }

    if (!response.ok) {
        throw fatalError(
            "PROTOBUF_FETCH_ERROR",
            `Failed to fetch protobuf from ${url}: ${response.status} ${response.statusText}`,
        );
    }

    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    const hasher = new CryptoHasher("sha256");
    hasher.update(bytes);
    const hash = hasher.digest("hex");

    // Fallback dedup: server returned 200 but content is identical (no conditional header support)
    if (prevHash !== undefined && hash === prevHash) {
        return { changed: false };
    }

    const cachedHeaders: CachedHeaders = {
        etag: response.headers.get("ETag") ?? undefined,
        lastModified: response.headers.get("Last-Modified") ?? undefined,
    };

    return { changed: true, data: { bytes, hash }, cachedHeaders };
}
