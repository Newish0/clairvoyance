import type { RangeResponse, Source } from "pmtiles";

const DB_NAME = "pmtiles-cache";
const STORE_NAME = "ranges";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            req.result.createObjectStore(STORE_NAME);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    return dbPromise;
}

/**
 * PMTiles Source backed by IndexedDB.
 * - getBytes checks IDB first (key = `${url}:${offset}:${length}`).
 * - On miss: fetch with Range header, store in IDB, return.
 * - getKey returns the URL so Protocol.add() matches tile requests.
 */
export class IdbSource implements Source {
    constructor(private url: string) {}

    getKey(): string {
        return this.url;
    }

    async getBytes(
        offset: number,
        length: number,
        signal?: AbortSignal,
        _etag?: string,
    ): Promise<RangeResponse> {
        const key = `${this.url}:${offset}:${length}`;
        const db = await openDB();

        // Try IDB first
        const tx = db.transaction(STORE_NAME, "readonly");
        const cached = await new Promise<ArrayBuffer | undefined>((resolve, reject) => {
            const req = tx.objectStore(STORE_NAME).get(key);
            req.onsuccess = () => resolve(req.result as ArrayBuffer | undefined);
            req.onerror = () => reject(req.error);
        });
        if (cached) return { data: cached };

        // Miss - fetch from network
        const res = await fetch(this.url, {
            signal,
            headers: { Range: `bytes=${offset}-${offset + length - 1}` },
        });
        if (!res.ok) throw new Error(`PMTiles fetch ${res.status} for ${this.url}`);
        const data = await res.arrayBuffer();

        // Store in IDB (fire-and-forget, don't block render)
        const storeTx = db.transaction(STORE_NAME, "readwrite");
        storeTx.objectStore(STORE_NAME).put(data, key);
        storeTx.commit();

        return { data, etag: res.headers.get("Etag") ?? undefined };
    }
}
