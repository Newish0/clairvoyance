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
        route_color: z.string().nullable(),
        route_text_color: z.string().nullable(),
        network_id: z.string().nullable().optional(),
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
    route_color: z.string().nullable(),
    route_text_color: z.string().nullable(),
    network_id: z.string().nullable().optional(),
});

export const stopGeoJsonSchema = z.object({
    type: z.literal("Feature"),
    properties: z.object({
        stop_id: z.string(),
        stop_code: z.string(),
        stop_name: z.string(),
        zone_id: z.string().nullable().optional(),
        location_type: z.number(),
        wheelchair_boarding: z.number(),
        level_id: z.string().nullable().optional(),
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
    route_short_name: z.string(),
    route_long_name: z.string(),
    route_desc: z.string(),
    continuous_pickup: z.nullable(z.string()),
    continuous_drop_off: z.nullable(z.string()),
    route_color: z.string(),
    route_type: z.number(),
    bearing: z.number(),
    latitude: z.number(),
    longitude: z.number(),
    speed: z.nullable(z.number()),
    vehicle_id: z.string(),
    timestamp: z.string(), // Assuming timestamp is always a string in the given format
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
