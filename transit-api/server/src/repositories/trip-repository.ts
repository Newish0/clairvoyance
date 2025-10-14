import { ObjectId } from "mongodb";
import { DataRepository } from "./data-repository";

export class TripRepository extends DataRepository {
    protected collectionName = "trips" as const;

    public async findById(routeObjectId: string) {
        return this.db
            .collection(this.collectionName)
            .findOne({ _id: new ObjectId(routeObjectId) });
    }
}
