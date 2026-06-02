import type { Transform } from "../core/pipe";
import { shapes } from "database/models/tables";
import type { CsvRow } from "../source/csvFileSource";
import type { Context } from "../core/context";
import { createInsertSchema } from "drizzle-orm/arktype";
import { type as akType } from "arktype";
import { recoverableError } from "../core/error";

interface ShapeAccumulator {
    points: Map<number, [number, number]>;
    distances: Map<number, number>;
}

export class ShapeTransformer implements Transform<CsvRow, typeof shapes.$inferInsert> {
    private shapeInsertSchema = createInsertSchema(shapes);
    private accumulators = new Map<string, ShapeAccumulator>();

    constructor(public agencyId: string) {}

    async *run(
        ctx: Context,
        input: AsyncIterable<CsvRow>,
    ): AsyncIterable<typeof shapes.$inferInsert> {
        for await (const row of input) {
            const shapeId = row["shape_id"];
            const ptLat = row["shape_pt_lat"];
            const ptLon = row["shape_pt_lon"];
            const ptSequence = row["shape_pt_sequence"];
            const distTraveled = row["shape_dist_traveled"];

            if (!shapeId || !ptLat || !ptLon || !ptSequence) {
                ctx.errors.push(
                    recoverableError(
                        "VALIDATION_ERROR",
                        `Missing required shape fields: shape_id=${shapeId}, pt_lat=${ptLat}, pt_lon=${ptLon}, pt_sequence=${ptSequence}`,
                    ),
                );
                ctx.skipped++;
                continue;
            }

            const lat = parseFloat(ptLat);
            const lon = parseFloat(ptLon);
            const sequence = parseInt(ptSequence, 10);

            if (isNaN(lat) || isNaN(lon) || isNaN(sequence)) {
                ctx.errors.push(
                    recoverableError(
                        "VALIDATION_ERROR",
                        `Invalid numeric values in shape: lat=${ptLat}, lon=${ptLon}, sequence=${ptSequence}`,
                    ),
                );
                ctx.skipped++;
                continue;
            }

            if (!this.accumulators.has(shapeId)) {
                this.accumulators.set(shapeId, {
                    points: new Map(),
                    distances: new Map(),
                });
            }

            const acc = this.accumulators.get(shapeId)!;
            acc.points.set(sequence, [lon, lat]);

            if (distTraveled) {
                const dist = parseFloat(distTraveled);
                if (!isNaN(dist)) {
                    acc.distances.set(sequence, dist);
                }
            }
        }

        for (const [shapeId, acc] of this.accumulators) {
            const sortedSequences = [...acc.points.keys()].sort((a, b) => a - b);

            let coordinates: [number, number][];
            if (sortedSequences.length > 1) {
                coordinates = sortedSequences.map((seq) => acc.points.get(seq) as [number, number]);
            } else {
                // HACK: PostGIS LineString requires at least 2 vertices. When a shape has only
                // a single point (which shouldn't happen in valid GTFS but does in the wild),
                // we duplicate it with a tiny offset so PostGIS doesn't reject the geometry.
                // This is a gross workaround — the resulting "line" is functionally meaningless
                // but at least prevents the entire shape from being dropped.
                const firstSeq = sortedSequences[0];
                if (firstSeq === undefined) continue;
                const single = acc.points.get(firstSeq) as [number, number];
                coordinates = [
                    single,
                    [single[0] + 0.00001, single[1] + 0.00001],
                ];
            }

            // Same hack for distances: if there's only one distance value, duplicate it
            // to match the duplicated point count so the arrays stay aligned.
            let distancesTraveled: number[] | null = null;
            if (acc.distances.size > 1) {
                distancesTraveled = sortedSequences
                    .filter((seq) => acc.distances.has(seq))
                    .map((seq) => acc.distances.get(seq) as number);
            } else if (acc.distances.size === 1) {
                const values = [...acc.distances.values()];
                const singleDist = values[0];
                if (singleDist !== undefined) {
                    distancesTraveled = [singleDist, singleDist];
                }
            }

            const shape = this.shapeInsertSchema({
                agencyId: this.agencyId,
                shapeSid: shapeId,
                path: coordinates,
                distancesTraveled: distancesTraveled ?? undefined,
            });

            if (shape instanceof akType.errors) {
                ctx.errors.push(
                    recoverableError(
                        "VALIDATION_ERROR",
                        `Shape validation failed for ${shapeId}: ${shape.summary}`,
                    ),
                );
                ctx.skipped++;
            } else {
                yield shape as typeof shapes.$inferInsert;
            }
        }

        this.accumulators.clear();
    }
}
