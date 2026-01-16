import { shapes } from "database";
import { DataRepository } from "./data-repository";
import { eq, sql } from "drizzle-orm";
import { Result, ok, err } from "neverthrow";
import * as v from "valibot";
import {
    parseGeoJSON,
    LineStringSchema,
    type LineString,
    type Feature,
    type GeoJSONError,
} from "../validations/geojson-validation";

// Define the properties schema for Shape features
const ShapePropertiesSchema = v.object({
    shapeId: v.number(),
    shapeSid: v.string(),
    agencyId: v.string(),
    distancesTraveled: v.nullable(v.array(v.number())),
});

type ShapeProperties = v.InferOutput<typeof ShapePropertiesSchema>;
type ShapeFeature = Feature<LineString, ShapeProperties>;

export class ShapeRepository extends DataRepository {
    public async findGeoJson(shapeId: number): Promise<Result<ShapeFeature | null, GeoJSONError>> {
        const result = await this.db
            .select({
                id: shapes.id,
                agencyId: shapes.agencyId,
                shapeSid: shapes.shapeSid,
                pathGeoJson: sql<string>`ST_AsGeoJSON(${shapes.path})`,
                distancesTraveled: shapes.distancesTraveled,
            })
            .from(shapes)
            .where(eq(shapes.id, shapeId));

        const shape = result[0];

        if (!shape) {
            return ok(null);
        }

        return this.transformShapeToGeoJson(shape);
    }

    private transformShapeToGeoJson(shape: {
        id: number;
        agencyId: string;
        shapeSid: string;
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
                shapeSid: shape.shapeSid,
                agencyId: shape.agencyId,
                distancesTraveled: shape.distancesTraveled,
            },
        };

        return ok(feature);
    }
}
