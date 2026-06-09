import { Db } from "../db";

export abstract class DataRepository {
    protected db: Db;

    constructor(db: Db) {
        this.db = db;
    }
}
