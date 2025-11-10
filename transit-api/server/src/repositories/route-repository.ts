import { ObjectId } from "mongodb";
import { DataRepository } from "./data-repository";

export class RouteRepository extends DataRepository {
    protected collectionName = "routes" as const;

    public async findById(routeObjectId: string) {
        return this.db
            .collection(this.collectionName)
            .findOne({ _id: new ObjectId(routeObjectId) });
    }
}
