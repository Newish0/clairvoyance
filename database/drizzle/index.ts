import { drizzle } from "drizzle-orm/bun-sql";

const db = drizzle(Bun.env.DATABASE_URL!);
