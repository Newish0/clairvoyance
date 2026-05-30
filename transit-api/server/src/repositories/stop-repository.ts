import { DataRepository } from "./data-repository";
import { stops } from "database";
import { and, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { Feature, FeatureCollection, Point } from "../validations/geojson-validation";
export class StopRepository extends DataRepository {
    public async findStop(stopId: typeof stops.$inferSelect.id) {
        return this.db.select().from(stops).where(eq(stops.id, stopId));
    }

    /** Look up stops by internal numeric IDs */
    public async findAllStops(stopIds: (typeof stops.$inferSelect.id)[]) {
        return this.db.select().from(stops).where(inArray(stops.id, stopIds));
    }

    /** Look up stops by agency ID + GTFS stop_sid */
    public async findByAgencyAndSids(agencyId: string, stopSids: string[]) {
        return this.db
            .select()
            .from(stops)
            .where(and(eq(stops.agencyId, agencyId), inArray(stops.stopSid, stopSids)));
    }

    /** Look up stops by agency ID + GTFS stop_sid, return GeoJSON */
    public async findGeoJsonByAgencyAndSids(agencyId: string, stopSids: string[]) {
        return this._stopsToGeoJson(
            await this.db
                .select({
                    ...getTableColumns(stops),
                    geometry: sql<Point>`ST_AsGeoJSON(${stops.location})::json`,
                })
                .from(stops)
                .where(and(eq(stops.agencyId, agencyId), inArray(stops.stopSid, stopSids))),
        );
    }

    /** Look up stops by internal numeric IDs, return GeoJSON */
    public async findStopsGeoJson(stopIds: (typeof stops.$inferSelect.id)[]) {
        return this._stopsToGeoJson(
            await this.db
                .select({
                    ...getTableColumns(stops),
                    geometry: sql<Point>`ST_AsGeoJSON(${stops.location})::json`,
                })
                .from(stops)
                .where(inArray(stops.id, stopIds)),
        );
    }

    private _stopsToGeoJson(
        result: { id: number; name: string | null; agencyId: string | null; stopSid: string; geometry: Point }[],
    ): FeatureCollection<Point> {

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

    public findNearbyStops(
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
