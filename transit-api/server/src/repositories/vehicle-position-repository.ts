import { DataRepository } from "./data-repository";
import { vehiclePositions } from "database";
import { eq } from "drizzle-orm";

export class VehiclePositionRepository extends DataRepository {
    public async findById(vehicleId: number) {
        const [result] = await this.db
            .select()
            .from(vehiclePositions)
            .where(eq(vehiclePositions.id, vehicleId));
        return result ?? null;
    }
}
