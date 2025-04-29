import { Hono } from "hono";
import { connectDB } from "@/services/mongo";

import stopsRouter from "@/routes/stops";
import shapesRouter from "@/routes/shapes";
import tripsRouter from "@/routes/trips";

const port = Bun.env.PORT || 3000;
const MONGO_CONNECTION_STRING = Bun.env.MONGO_CONNECTION_STRING || "mongodb://localhost:27017";
const MONGO_DB_NAME = Bun.env.MONGO_DB_NAME || "gtfs_data";

await connectDB(MONGO_CONNECTION_STRING, MONGO_DB_NAME);

const app = new Hono();
app.get("/", (c) => c.text("Hello Bun!"));

app.route("/stops", stopsRouter);
app.route("/shapes", shapesRouter);
app.route("/trips", tripsRouter);

export default {
    port,
    fetch: app.fetch,
};
