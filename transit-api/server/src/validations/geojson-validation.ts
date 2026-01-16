import * as v from "valibot";
import { Result, err, ok } from "neverthrow";

// ============================================================================
// Base Schemas
// ============================================================================

/**
 * Position: [longitude, latitude] or [longitude, latitude, elevation]
 * Validates coordinates are within valid ranges
 */
export const PositionSchema = v.pipe(
    v.union([
        v.tuple([v.number(), v.number()]), // [lon, lat]
        v.tuple([v.number(), v.number(), v.number()]), // [lon, lat, elevation]
    ]),
    v.check((pos) => pos[0] >= -180 && pos[0] <= 180, "Longitude must be between -180 and 180"),
    v.check((pos) => pos[1] >= -90 && pos[1] <= 90, "Latitude must be between -90 and 90")
);

export type Position = v.InferOutput<typeof PositionSchema>;

// ============================================================================
// Geometry Schemas (Point & LineString only)
// ============================================================================

/**
 * Point Geometry - for stops.location and vehicle_positions.location
 */
export const PointSchema = v.object({
    type: v.literal("Point"),
    coordinates: PositionSchema,
});

export type Point = v.InferOutput<typeof PointSchema>;

/**
 * LineString Geometry - for shapes.path
 */
export const LineStringSchema = v.pipe(
    v.object({
        type: v.literal("LineString"),
        coordinates: v.array(PositionSchema),
    }),
    v.check((geom) => geom.coordinates.length >= 2, "LineString must have at least 2 positions")
);

export type LineString = v.InferOutput<typeof LineStringSchema>;

/**
 * Union of geometries used in the transit schema
 */
export const GeometrySchema = v.union([PointSchema, LineStringSchema]);

export type Geometry = Point | LineString;

// ============================================================================
// Feature Schemas
// ============================================================================

/**
 * Generic Feature with typed properties and geometry
 */
export function createFeatureSchema<
    TProps extends v.BaseSchema<any, any, any>,
    TGeom extends v.BaseSchema<any, any, any> = typeof GeometrySchema
>(propertiesSchema: TProps, geometrySchema?: TGeom) {
    return v.object({
        type: v.literal("Feature"),
        geometry: geometrySchema ?? GeometrySchema,
        properties: propertiesSchema,
        id: v.optional(v.union([v.string(), v.number()])),
    });
}

/**
 * Generic FeatureCollection with typed properties and geometry
 */
export function createFeatureCollectionSchema<
    TProps extends v.BaseSchema<any, any, any>,
    TGeom extends v.BaseSchema<any, any, any> = typeof GeometrySchema
>(propertiesSchema: TProps, geometrySchema?: TGeom) {
    const featureSchema = createFeatureSchema(propertiesSchema, geometrySchema);
    return v.object({
        type: v.literal("FeatureCollection"),
        features: v.array(featureSchema),
    });
}

export type Feature<TGeom extends Geometry = Geometry, TProps = any> = {
    type: "Feature";
    geometry: TGeom;
    properties: TProps;
    id?: string | number;
};

export type FeatureCollection<TGeom extends Geometry = Geometry, TProps = any> = {
    type: "FeatureCollection";
    features: Feature<TGeom, TProps>[];
};

// ============================================================================
// Error Types
// ============================================================================

export type GeoJSONError =
    | { type: "INVALID_JSON"; message: string }
    | { type: "VALIDATION_ERROR"; issues: v.ValiError<any>["issues"] };

// ============================================================================
// Utility Functions (with neverthrow)
// ============================================================================

/**
 * Parse and validate GeoJSON from a string
 * Returns Result<T, GeoJSONError>
 */
export function parseGeoJSON<T = Geometry>(
    jsonString: string,
    schema: v.BaseSchema<any, T, any> = GeometrySchema as any
): Result<T, GeoJSONError> {
    try {
        const parsed = JSON.parse(jsonString);
        const result = v.safeParse(schema, parsed);

        if (result.success) {
            return ok(result.output);
        }

        return err({
            type: "VALIDATION_ERROR" as const,
            issues: result.issues,
        });
    } catch (error) {
        return err({
            type: "INVALID_JSON" as const,
            message: error instanceof Error ? error.message : "Invalid JSON",
        });
    }
}

/**
 * Validate GeoJSON object (already parsed)
 * Returns Result<T, GeoJSONError>
 */
export function validateGeoJSON<T = Geometry>(
    data: unknown,
    schema: v.BaseSchema<any, T, any> = GeometrySchema as any
): Result<T, GeoJSONError> {
    const result = v.safeParse(schema, data);

    if (result.success) {
        return ok(result.output);
    }

    return err({
        type: "VALIDATION_ERROR" as const,
        issues: result.issues,
    });
}

/**
 * Check if data is valid GeoJSON
 */
export function isValidGeoJSON<T = Geometry>(
    data: unknown,
    schema: v.BaseSchema<any, T, any> = GeometrySchema as any
): data is T {
    const result = v.safeParse(schema, data);
    return result.success;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isPoint(geom: Geometry): geom is Point {
    return geom.type === "Point";
}

export function isLineString(geom: Geometry): geom is LineString {
    return geom.type === "LineString";
}

// ============================================================================
// Helper Functions for Common Patterns
// ============================================================================

/**
 * Parse multiple GeoJSON strings, collecting successes and failures
 */
export function parseGeoJSONBatch<T = Geometry>(
    jsonStrings: string[],
    schema: v.BaseSchema<any, T, any> = GeometrySchema as any
): {
    successes: T[];
    failures: Array<{ index: number; error: GeoJSONError }>;
} {
    const successes: T[] = [];
    const failures: Array<{ index: number; error: GeoJSONError }> = [];

    jsonStrings.forEach((jsonString, index) => {
        const result = parseGeoJSON(jsonString, schema);

        if (result.isOk()) {
            successes.push(result.value);
        } else {
            failures.push({ index, error: result.error });
        }
    });

    return { successes, failures };
}

/**
 * Format GeoJSON error for display
 */
export function formatGeoJSONError(error: GeoJSONError): string {
    if (error.type === "INVALID_JSON") {
        return `Invalid JSON: ${error.message}`;
    }

    const issueMessages = error.issues.map((issue: any) => {
        return `${issue.path?.map((p: any) => p.key).join(".") || "root"}: ${issue.message}`;
    });

    return `Validation error:\n${issueMessages.join("\n")}`;
}
