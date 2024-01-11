import { z, ZodError } from "zod";

export const coordinateSchema = z.tuple([z.number(), z.number()]);

export const shapeGeoJsonSchema = z.object({
    type: z.literal("Feature"),
    properties: z.object({
        agency_name: z.string(),
        route_id: z.string(),
        agency_id: z.string(),
        route_short_name: z.string(),
        route_long_name: z.string(),
        route_desc: z.string(),
        route_type: z.number(),
        route_color: z.string(),
        route_text_color: z.string(),
        network_id: z.string().nullable(),
    }),
    geometry: z.object({
        type: z.literal("LineString"),
        coordinates: z.array(coordinateSchema),
    }),
});

export const routeSchema = z.object({
    route_id: z.string(),
    agency_id: z.string(),
    route_short_name: z.string(),
    route_long_name: z.string(),
    route_desc: z.string(),
    route_type: z.number(),
    route_color: z.string(),
    route_text_color: z.string(),
    network_id: z.string().nullable(),
});

export const stopGeoJsonSchema = z.object({
    type: z.literal("Feature"),
    properties: z.object({
        stop_id: z.string(),
        stop_code: z.string(),
        stop_name: z.string(),
        zone_id: z.string().nullable(),
        location_type: z.number(),
        wheelchair_boarding: z.number(),
        level_id: z.string().nullable(),
        routes: z.array(routeSchema),
        agency_name: z.string(),
    }),
    geometry: z.object({
        type: z.literal("Point"),
        coordinates: coordinateSchema,
    }),
});

export const tripSchema = z.object({
    route_id: z.string(),
    service_id: z.string(),
    trip_id: z.string(),
    trip_headsign: z.string(),
    trip_short_name: z.nullable(z.string()),
    direction_id: z.number(),
    block_id: z.string(),
    shape_id: z.string(),
    wheelchair_accessible: z.number(),
    bikes_allowed: z.number(),
});

export const vehiclePositionSchema = z.object({
    update_id: z.string(),
    bearing: z.number().nullable(),
    latitude: z.number(),
    longitude: z.number(),
    speed: z.number().nullable(),
    trip_id: z.string().nullable(),
    vehicle_id: z.string(),
    timestamp: z.string(),
    isUpdated: z.number(),
});

export const shapesGeojsonApiDataSchema = z.object({
    features: z.array(shapeGeoJsonSchema),
    type: z.literal("FeatureCollection"),
});

export const stopsGeojsonApiDataSchema = z.object({
    features: z.array(stopGeoJsonSchema),
    type: z.literal("FeatureCollection"),
});

export const tripsApiDataSchema = z.array(tripSchema);

export const vehiclePositionsApiDataSchema = z.array(vehiclePositionSchema);
