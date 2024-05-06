import { Hono } from "hono";

import transitController from "./controller";

const transits = new Hono();

transitController(transits);

export default transits;
