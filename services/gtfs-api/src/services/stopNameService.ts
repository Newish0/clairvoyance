import type { Db } from "mongodb";
import { LRUCache } from "lru-cache";

/**
 * This service is used to retrieve the stop name
 * given a stop id. It also caches the stop name
 * so that it doesn't have to be fetched multiple times.
 */
export class StopNameService {
    private db: Db;
    private static readonly DEFAULT_CACHE_CONFIG = { max: 5000, ttl: 3600 * 1000 };
    private cache: LRUCache<string, string>;

    private static instances: Map<Db, StopNameService> = new Map();

    private constructor(db: Db) {
        this.db = db;
        this.cache = new LRUCache(StopNameService.DEFAULT_CACHE_CONFIG);

        StopNameService.instances.set(db, this);
        return this;
    }

    public static getInstance(db: Db): StopNameService {
        return StopNameService.instances.get(db) ?? new StopNameService(db);
    }

    public configCache(max: number, ttl: number): void {
        const tmp = this.cache;
        this.cache = new LRUCache({ max, ttl });
        tmp.forEach((value, key) => this.cache.set(key, value));
    }

    public async getStopNameByStopId(stopId: string): Promise<string | null> {
        if (this.cache.has(stopId)) {
            return this.cache.get(stopId) ?? null;
        }
        const stopNameDoc = await this.db
            .collection("stops")
            .findOne({ stop_id: stopId }, { projection: { stop_name: 1 } });

        if (!stopNameDoc) {
            return null;
        }

        const stopName = stopNameDoc.stop_name;
        this.cache.set(stopId, stopName);
        return stopName;
    }
}
