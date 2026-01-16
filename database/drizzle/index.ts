import { drizzle } from "drizzle-orm/bun-sql";
import { routes } from "./models";
import { eq } from "drizzle-orm";

export * from "./models";

// export const createDatabase = (databaseUrl: string) => {
//     return drizzle(databaseUrl);
// };

// const db = createDatabase("");
// db.select().from(routes).where(eq(routes.id, 123));
