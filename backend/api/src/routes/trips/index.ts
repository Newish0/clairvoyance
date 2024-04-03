import { Hono } from "hono";
import tripsController from "./controller";

const trips = new Hono();

tripsController(trips);

export default trips;
