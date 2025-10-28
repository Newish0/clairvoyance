import { DataRepository } from "./data-repository";
import type { FeatureCollection } from "geojson";

export class StopRepository extends DataRepository {
    protected collectionName = "stops" as const;

    public async findStop(agency_id: string, stop_id: string) {
        return this.db.collection(this.collectionName).findOne({ agency_id, stop_id });
    }

    public async findAllStops(agencyId: string, stopIds: string[]) {
        return this.db
            .collection(this.collectionName)
            .find({ agency_id: agencyId, stop_id: { $in: stopIds } })
            .toArray();
    }

    public async findGeoJson(agencyId: string, stopIds: string[]) {
        const stopCursor = this.db.collection(this.collectionName).find({
            agency_id: agencyId,
            stop_id: {
                $in: stopIds,
            },
        });

        const features = (await stopCursor.toArray())
            .filter((stop) => stop.location !== null)
            .map(
                (stop) =>
                    ({
                        type: "Feature",
                        properties: { stopId: stop.stop_id },
                        geometry: stop.location!,
                    } as const)
            );

        const geoJson: FeatureCollection = {
            type: "FeatureCollection",
            features,
        };

        return geoJson;
    }

    public async findNearbyStops(
        params:
            | { lat: number; lng: number } & (
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
        maxRadius = 10000 // 10km
    ) {
        const nearbyStopsCursor = this.db.collection(this.collectionName).aggregate([
            {
                $geoNear: {
                    near: { type: "Point", coordinates: [params.lng, params.lat] },
                    distanceField: "distance",
                    maxDistance: "radius" in params ? params.radius : maxRadius,
                    spherical: true,
                    query: {},
                },
            },
            "bbox" in params
                ? {
                      $match: {
                          location: {
                              $geoWithin: {
                                  $box: [
                                      [params.bbox.minLng, params.bbox.minLat], // southwest
                                      [params.bbox.maxLng, params.bbox.maxLat], // northeast
                                  ],
                              },
                          },
                      },
                  }
                : {},
            {
                $project: {
                    _id: 1,
                    stop_id: 1,
                    distance: 1,
                    stop_name: 1,
                    location: 1,
                },
            },
            {
                $sort: { distance: 1 },
            },
        ]);

        const nearbyStops: {
            _id: string;
            stop_id: string;
            distance: number;
            stop_name: string;
            location: { type: string; coordinates: [number, number] };
        }[] = (await nearbyStopsCursor.toArray()) as any;

        return nearbyStops;
    }
}
