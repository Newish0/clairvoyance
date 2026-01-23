import { BunSQLDatabase } from "drizzle-orm/bun-sql";
import * as schema from "database";
export abstract class DataRepository {
    protected db: BunSQLDatabase<typeof schema>;

    constructor(db: BunSQLDatabase<typeof schema>) {
        this.db = db;
    }
}
