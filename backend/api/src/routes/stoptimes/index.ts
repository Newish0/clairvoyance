import { Hono } from "hono";

import stoptimesController from "./controller";

const stoptimes = new Hono();

stoptimesController(stoptimes);

export default stoptimes;
