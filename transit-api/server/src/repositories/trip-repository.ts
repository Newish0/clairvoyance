import { trips } from "database";
import { eq } from "drizzle-orm";
import { DataRepository } from "./data-repository";

export class TripRepository extends DataRepository {
    public async findById(tripId: number) {
        return this.db.select().from(trips).where(eq(trips.id, tripId));
    }
}
