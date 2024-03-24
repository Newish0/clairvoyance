import transitController from "@/controllers/transit";
import { Hono } from "hono";

const api = new Hono();

const transit = new Hono();
transitController(transit);
api.route("/transit", transit);

export default api;
