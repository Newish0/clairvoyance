import { DataRepository } from "./data-repository";

export class ShapeRepository extends DataRepository {
    protected collectionName = "shapes" as const;

    public async findGeoJson(agencyId: string, shapeId: string) {
        const shape = await this.db
            .collection(this.collectionName)
            .findOne({ agency_id: agencyId, shape_id: shapeId });

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
