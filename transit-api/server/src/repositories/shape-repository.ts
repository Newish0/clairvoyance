import { shapes } from "database";
import { sql } from "drizzle-orm";
import { Result, err, ok } from "neverthrow";
import * as v from "valibot";
import {
    LineStringSchema,
    parseGeoJSON,
    type Feature,
    type GeoJSONError,
    type LineString,
} from "../validations/geojson-validation";
import { DataRepository } from "./data-repository";

// Define the properties schema for Shape features
const ShapePropertiesSchema = v.object({
    shapeId: v.number(),
    distancesTraveled: v.nullable(v.array(v.number())),
});

type ShapeProperties = v.InferOutput<typeof ShapePropertiesSchema>;
type ShapeFeature = Feature<LineString, ShapeProperties>;

export class ShapeRepository extends DataRepository {
    public async findGeoJsonById(
        shapeId: typeof shapes.$inferSelect.id,
    ): Promise<Result<ShapeFeature | null, GeoJSONError>> {
        const shape = await this.db.query.shapes.findFirst({
            columns: {
                id: true,
                distancesTraveled: true,
            },
            extras: {
                pathGeoJson: sql<string>`ST_AsGeoJSON(${shapes.path})`,
            },
            where: {
                id: shapeId,
            },
        });

        if (!shape) {
            return ok(null);
        }

        return this.transformShapeToGeoJson(shape);
    }

    private transformShapeToGeoJson(shape: {
        id: number;
        pathGeoJson: string;
        distancesTraveled: number[] | null;
    }): Result<ShapeFeature, GeoJSONError> {
        // Parse and validate the LineString geometry because DB returns string
        const geometryResult = parseGeoJSON<LineString>(shape.pathGeoJson, LineStringSchema);

        if (geometryResult.isErr()) {
            return err(geometryResult.error);
        }

        const feature: ShapeFeature = {
            type: "Feature",
            geometry: geometryResult.value,
            properties: {
                shapeId: shape.id,
                distancesTraveled: shape.distancesTraveled,
            },
        };

        return ok(feature);
    }
}
