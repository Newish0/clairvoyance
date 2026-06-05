import type { Source } from "../core/pipe";
import type { Context } from "../core/context";
import { fatalError } from "../core/error";

export interface ProtobufData {
    bytes: Uint8Array;
    hash: string;
}

/**
 * Yields pre-fetched protobuf bytes with a SHA-256 hash.
 * The fetch and dedup logic lives in the orchestrator (gtfs-realtime.ts).
 */
export class ProtobufSource implements Source<ProtobufData> {
    constructor(private data: ProtobufData) {}

    async *run(_ctx: Context): AsyncIterable<ProtobufData> {
        yield this.data;
    }
}

/**
 * Fetch protobuf bytes from a URL and compute SHA-256 hash.
 * Used by the orchestrator for dedup across poll cycles.
 */
export async function fetchProtobuf(
    url: string,
    signal: AbortSignal,
): Promise<ProtobufData> {
    const response = await fetch(url, {
        signal,
        headers: { Accept: "application/octet-stream, application/x-protobuf, */*" },
    });

    if (!response.ok) {
        throw fatalError(
            "PROTOBUF_FETCH_ERROR",
            `Failed to fetch protobuf from ${url}: ${response.status} ${response.statusText}`,
        );
    }

    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    const hasher = new Bun.CryptoHasher("sha256");
    hasher.update(bytes);
    const hash = hasher.digest("hex");

    return { bytes, hash };
}
