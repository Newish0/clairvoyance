import { ObjectId, WithId } from "mongodb";
import { DataRepository } from "./data-repository";
import { Shape } from "../../../../gtfs-processor/shared/gtfs-db-types";
import { OmitId } from "../database/mongo";

export class ShapeRepository extends DataRepository {
    protected collectionName = "shapes" as const;

    public async findGeoJson(agencyId: string, shapeId: string) {
        const shape = await this.db
            .collection(this.collectionName)
            .findOne({ agency_id: agencyId, shape_id: shapeId });

        return this.transformShapeToGeojson(shape);
    }

    public async findGeoJsonById(shapeObjectId: string) {
        const shape = await this.db
            .collection(this.collectionName)
            .findOne({ _id: new ObjectId(shapeObjectId) });

        return this.transformShapeToGeojson(shape);
    }

    private transformShapeToGeojson(shape: WithId<OmitId<Shape>> | null | undefined) {
        if (!shape) {
            return null;
        }

        return {
            type: "Feature",
            properties: {
                shapeId: shape.shape_id,
                distances_traveled: shape.distances_traveled || [],
            },
            geometry: shape.geometry,
        } as const;
    }
}
