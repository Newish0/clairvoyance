import { Hono } from "hono";

import stopsController from "./controller";

const stops = new Hono();

stopsController(stops);

export default stops;
