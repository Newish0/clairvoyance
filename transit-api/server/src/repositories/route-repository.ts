import { DataRepository } from "./data-repository";
import { routes } from "database";
import { eq } from "drizzle-orm";
export class RouteRepository extends DataRepository {
    public async findById(routeId: number) {
        return this.db.select().from(routes).where(eq(routes.id, routeId));
    }
}
