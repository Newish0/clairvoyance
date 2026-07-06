import { Db } from "database";

export abstract class DataRepository {
    protected db: Db;

    constructor(db: Db) {
        this.db = db;
    }
}
