import { Elysia } from "elysia";
import { Logestic } from "logestic";
import { cors } from "@elysiajs/cors";
import { connectDB } from "@/services/mongo";

import stopsRouter from "@/routes/stops";
import shapesRouter from "@/routes/shapes";
import tripsRouter from "@/routes/trips";
import routesRouter from "@/routes/routes";
import alertsRouter from "@/routes/alerts";
import swagger from "@elysiajs/swagger";

const port = Bun.env.PORT || 5888;
const MONGO_CONNECTION_STRING = Bun.env.MONGO_CONNECTION_STRING || "mongodb://localhost:27017";
const MONGO_DB_NAME = Bun.env.MONGO_DB_NAME || "gtfs_data";

await connectDB(MONGO_CONNECTION_STRING, MONGO_DB_NAME);

const app = new Elysia()
    .use(cors())
    .use(Logestic.preset("fancy"))
    .use(swagger())
    .get("/", () => "Hello from GTFS API!")
    .use(stopsRouter)
    .use(shapesRouter)
    .use(tripsRouter)
    .use(routesRouter)
    .use(alertsRouter)
    .on("start", () => {
        console.log(`Listening on port ${port}`);
    })
    .listen({
        port,
        idleTimeout: 30,
    });

export type App = typeof app;
