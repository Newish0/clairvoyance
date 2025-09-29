import { MongoClient, Db, Collection, type Document } from "mongodb";

import type { Shape, Stop, Route, ScheduledTripDocument, Alert } from "gtfs-db-types";

export type OmitId<T> = Omit<T, "_id">;

interface TypedDb extends Db {
    collection<T extends Shape>(name: "shapes"): Collection<OmitId<T>>;
    collection<T extends Stop>(name: "stops"): Collection<OmitId<T>>;
    collection<T extends Route>(name: "routes"): Collection<OmitId<T>>;
    collection<T extends ScheduledTripDocument>(name: "scheduled_trips"): Collection<OmitId<T>>;
    collection<T extends Alert>(name: "alerts"): Collection<OmitId<T>>;
}

let db: TypedDb | null = null;
let client: MongoClient;

export async function connectDB(connStr: string, dbName: string) {
    if (db) {
        return;
    }
    try {
        client = new MongoClient(connStr);
        await client.connect();
        console.log("Connected successfully to MongoDB");
        db = client.db(dbName);
    } catch (error) {
        console.error("Could not connect to MongoDB", error);
        process.exit(1); // Exit if DB connection fails
    }
}

export async function getDb(): Promise<TypedDb> {
    if (!db) {
        throw new Error("Database not connected");
    }
    return db;
}
