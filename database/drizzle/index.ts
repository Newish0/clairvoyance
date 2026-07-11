import { schemaRelations } from "./models/relations";

import type { PgAsyncDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

export type Db<TClient = never> = PgAsyncDatabase<PgQueryResultHKT, typeof schemaRelations> &
    ([TClient] extends [never] ? {} : { $client: TClient });

export * from "./models";
