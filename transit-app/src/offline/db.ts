import { PGliteWorker as PGliteWorkerWrapper } from "@electric-sql/pglite/worker";
import type { Db } from "database";
import { schemaRelations } from "database/models/relations";
import { drizzle } from "drizzle-orm/pglite";
import PGLiteWorker from "./pglite-worker?worker";
import type { PGlite } from "@electric-sql/pglite";

export type PGliteDb = Db<PGlite>;

let _dbPromise: Promise<PGliteDb> | null = null;

export const getDb = async (): Promise<PGliteDb> => {
    if (_dbPromise) return _dbPromise;

    _dbPromise = (async () => {
        const pg = await PGliteWorkerWrapper.create(new PGLiteWorker(), {
            id: "transit-pglite",
        });
        return drizzle({
            // HACK: drizzle-orm typing doesn't support PGliteWorker but they should have the same API
            client: pg as unknown as PGlite,
            relations: schemaRelations,
        });
    })();

    return _dbPromise;
};

// TODO
/** Close PGlite worker and reset cached db reference. Call when disabling offline mode. */
// export const destroyDb = async () => {
//     const db = await getDb();
//     db.$client.close();
//     indexedDB.deleteDatabase('/pglite/my-database')
// };
