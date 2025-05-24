import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { showRoutes } from "hono/dev";

import { connectDB } from "@/services/mongo";

import stopsRouter from "@/routes/stops";
import shapesRouter from "@/routes/shapes";
import tripsRouter from "@/routes/trips";
import routesRouter from "@/routes/routes";
import alertsRouter from "@/routes/alerts";

const port = Bun.env.PORT || 5888;
const MONGO_CONNECTION_STRING = Bun.env.MONGO_CONNECTION_STRING || "mongodb://localhost:27017";
const MONGO_DB_NAME = Bun.env.MONGO_DB_NAME || "gtfs_data";

await connectDB(MONGO_CONNECTION_STRING, MONGO_DB_NAME);

const app = new Hono();

app.use(cors());
app.use(logger());

app.get("/", (c) => c.text("Hello Bun!"));

app.route("/stops", stopsRouter);
app.route("/shapes", shapesRouter);
app.route("/trips", tripsRouter);
app.route("/routes", routesRouter);
app.route("/alerts", alertsRouter);

if (Bun.env.ENV === "development") {
    console.log("Running in development mode with configurations:");
    showRoutes(app, {
        verbose: true,
    });
}

export default {
    port,
    fetch: app.fetch,
    idleTimeout: 30,
};
