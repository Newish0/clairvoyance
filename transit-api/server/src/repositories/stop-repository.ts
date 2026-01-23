import { DataRepository } from "./data-repository";
import { stops } from "database";
import { and, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { Feature, FeatureCollection, Point } from "../validations/geojson-validation";
export class StopRepository extends DataRepository {
    public async findStop(stopId: typeof stops.$inferSelect.id) {
        return this.db.select().from(stops).where(eq(stops.id, stopId));
    }

    public async findAllStops(stopIds: (typeof stops.$inferSelect.id)[]) {
        return this.db.select().from(stops).where(inArray(stops.id, stopIds));
    }

    public async findStopsGeoJson(stopIds: (typeof stops.$inferSelect.id)[]) {
        const result = await this.db
            .select({
                ...getTableColumns(stops),
                // Convert PostGIS geometry to GeoJSON
                geometry: sql<Point>`ST_AsGeoJSON(${stops.location})::json`,
            })
            .from(stops)
            .where(inArray(stops.id, stopIds));

        const features = result.map(
            (stop) =>
                ({
                    type: "Feature",
                    properties: {
                        id: stop.id,
                        name: stop.name,
                        agencyId: stop.agencyId,
                        stopSid: stop.stopSid,
                    },
                    geometry: stop.geometry,
                }) as const,
        );

        const geoJson: FeatureCollection<Point> = {
            type: "FeatureCollection",
            features,
        };

        return geoJson;
    }

    public async findNearbyStops(
        params: { lat: number; lng: number } & (
            | { radius: number }
            | {
                  bbox: {
                      minLat: number;
                      maxLat: number;
                      minLng: number;
                      maxLng: number;
                  };
              }
        ),
        maxRadius = 10000, // 10km
    ) {
        return this.db
            .select({
                id: stops.id,
                name: stops.name,
                code: stops.code,
                geometry: sql<Point>`ST_AsGeoJSON(${stops.location})::json`,
                distance:
                    sql<number>`ST_Distance(${stops.location}::geography, ST_SetSRID(ST_MakePoint(${params.lng}, ${params.lat}), 4326)::geography)`.as(
                        "distance",
                    ),
            })
            .from(stops)
            .where(
                and(
                    sql`ST_DWithin(
                        ${stops.location}::geography,
                        ST_SetSRID(ST_MakePoint(${params.lng}, ${params.lat}), 4326)::geography,
                        ${("radius" in params && params.radius) || maxRadius}
                    )`,
                    "bbox" in params
                        ? sql`ST_Within(
                        ${stops.location},
                        ST_MakeEnvelope(${params.bbox.minLng}, ${params.bbox.minLat}, ${params.bbox.maxLng}, ${params.bbox.maxLat}, 4326)
                    )`
                        : undefined,
                ),
            )
            .orderBy((st) => st.distance);
    }
}
