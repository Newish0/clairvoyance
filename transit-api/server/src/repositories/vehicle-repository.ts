import { ObjectId } from "mongodb";
import { DataRepository } from "./data-repository";

export class VehicleRepository extends DataRepository {
    protected collectionName = "vehicles" as const;

    public async findById(id: string | ObjectId) {
        return this.db.collection(this.collectionName).findOne({ _id: new ObjectId(id) });
    }
}
