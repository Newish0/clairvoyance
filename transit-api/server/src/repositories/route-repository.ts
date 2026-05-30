import { DataRepository } from "./data-repository";
import { routes } from "database";
import { eq } from "drizzle-orm";
export class RouteRepository extends DataRepository {
    public async findById(routeId: typeof routes.$inferSelect.id) {
        return this.db.query.routes.findFirst({ where: eq(routes.id, routeId) });
    }
}
