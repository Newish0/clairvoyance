import { MongoClient, Db, Collection, type Document } from "mongodb";

import type {
    Shape,
    Stop,
    Route,
    Alert,
    TripInstance,
} from "@root/gtfs-processor/shared/gtfs-db-types";

export type OmitId<T> = Omit<T, "_id">;

export interface TransitDb extends Db {
    collection<T extends Shape>(name: "shapes"): Collection<OmitId<T>>;
    collection<T extends Stop>(name: "stops"): Collection<OmitId<T>>;
    collection<T extends Route>(name: "routes"): Collection<OmitId<T>>;
    collection<T extends TripInstance>(name: "trip_instances"): Collection<OmitId<T>>;
    collection<T extends Alert>(name: "alerts"): Collection<OmitId<T>>;
}

export class DatabaseManager {
    private static instances: Map<string, DatabaseManager> = new Map();
    private _db?: TransitDb;
    private client: MongoClient;

    private constructor(private connectionString: string, private dbName: string) {
        this.client = new MongoClient(this.connectionString);
    }

    private static getInstanceKey(connectionString: string, dbName: string) {
        return `${connectionString}-${dbName}`;
    }

    public static getInstance(connectionString: string, dbName: string): DatabaseManager {
        const key = DatabaseManager.getInstanceKey(connectionString, dbName);
        if (DatabaseManager.instances.has(key)) {
            return DatabaseManager.instances.get(key)!;
        }
        const instance = new DatabaseManager(connectionString, dbName);
        DatabaseManager.instances.set(key, instance);
        return instance;
    }

    public async connect() {
        if (this._db) {
            return;
        }
        await this.client.connect();
        this._db = this.client.db(this.dbName);
    }

    public async close() {
        await this.client.close();
        this._db = undefined;
    }

    get db() {
        if (!this._db) {
            throw new Error("Database not connected");
        }
        return this._db;
    }
}
