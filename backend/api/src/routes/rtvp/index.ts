import { Hono } from "hono";
import rtvpController from "./controller";

const rtvp = new Hono();

rtvpController(rtvp);

export default rtvp;
