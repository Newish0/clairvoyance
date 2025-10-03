import { TransitDb } from "@/database/mongo";

export abstract class DataRepository {
    protected abstract readonly collectionName: string;
    protected db: TransitDb;

    constructor(db: TransitDb) {
        this.db = db;
    }
}
