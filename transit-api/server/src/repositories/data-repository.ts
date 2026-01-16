import { BunSQLDatabase } from "drizzle-orm/bun-sql";

export abstract class DataRepository {
    protected db: BunSQLDatabase;

    constructor(db: BunSQLDatabase) {
        this.db = db;
    }
}
