import { PGliteWorker as PGliteWorkerWrapper } from "@electric-sql/pglite/worker";
import type { Db } from "database";
import { schemaRelations } from "database/models/relations";
import { drizzle } from "drizzle-orm/pglite";
import PGLiteWorker from "./pglite-worker?worker";

export const getDb = (): Db => {
    const pg = new PGliteWorkerWrapper(new PGLiteWorker());

    const db = drizzle({
        client: pg as any,
        relations: schemaRelations,
    });

    return db;
};
