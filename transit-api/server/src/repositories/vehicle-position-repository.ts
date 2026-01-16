import { DataRepository } from "./data-repository";

export class VehiclePositionRepository extends DataRepository {
    public async findById(vehicleId: number) {
        // return this.db.collection(this.collectionName).findOne({ _id: new ObjectId(id) });
        return null; // TODO
    }
}
