import { trips } from "database";
import { eq } from "drizzle-orm";
import { DataRepository } from "./data-repository";

export class TripRepository extends DataRepository {
    public async findById(tripId: typeof trips.$inferSelect.id) {
        return this.db.select().from(trips).where(eq(trips.id, tripId));
    }
}
