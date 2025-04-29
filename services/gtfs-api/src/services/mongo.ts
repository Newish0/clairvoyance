import { MongoClient, Db, Collection } from "mongodb";

let db: Db | null = null;
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

export async function getDb(): Promise<Db> {
    if (!db) {
        throw new Error("Database not connected");
    }
    return db;
}
