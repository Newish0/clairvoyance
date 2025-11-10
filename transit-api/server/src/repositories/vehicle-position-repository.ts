import { ObjectId } from "mongodb";
import { DataRepository } from "./data-repository";

export class VehiclePositionRepository extends DataRepository {
    protected collectionName = "vehicle_positions" as const;

    public async findById(id: string | ObjectId) {
        return this.db.collection(this.collectionName).findOne({ _id: new ObjectId(id) });
    }
}
