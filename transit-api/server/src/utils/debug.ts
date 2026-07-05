import { Db } from "database";
import { sql, SQLWrapper } from "drizzle-orm";

export const explainAnalyze = async <T extends SQLWrapper>(db: Db, query: T) => {
    const debugResult = await db.execute(sql`EXPLAIN ANALYZE ${query.getSQL()}`);
    console.debug(debugResult);
};
