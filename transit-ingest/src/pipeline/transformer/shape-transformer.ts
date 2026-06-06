import type { Transform } from "../core/pipe";
import { shapes } from "database/models/tables";
import type { CsvRow } from "../source/csv-file-source";
import type { Context } from "../core/context";
import { createInsertSchema } from "drizzle-orm/arktype";
import { type as akType } from "arktype";
import { type ItemResult, itemOk, skipItem } from "../core/error";

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
    ): AsyncIterable<ItemResult<typeof shapes.$inferInsert>> {
        for await (const row of input) {
            const shapeId = row["shape_id"];
            const ptLat = row["shape_pt_lat"];
            const ptLon = row["shape_pt_lon"];
            const ptSequence = row["shape_pt_sequence"];
            const distTraveled = row["shape_dist_traveled"];

            if (!shapeId || !ptLat || !ptLon || !ptSequence) {
                yield skipItem(
                    "VALIDATION_ERROR",
                    `Missing required shape fields: shape_id=${shapeId}, pt_lat=${ptLat}, pt_lon=${ptLon}, pt_sequence=${ptSequence}`,
                );
                continue;
            }

            const lat = parseFloat(ptLat);
            const lon = parseFloat(ptLon);
            const sequence = parseInt(ptSequence, 10);

            if (isNaN(lat) || isNaN(lon) || isNaN(sequence)) {
                yield skipItem(
                    "VALIDATION_ERROR",
                    `Invalid numeric values in shape: lat=${ptLat}, lon=${ptLon}, sequence=${ptSequence}`,
                );
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
                const firstSeq = sortedSequences[0];
                if (firstSeq === undefined) continue;
                const single = acc.points.get(firstSeq) as [number, number];
                coordinates = [
                    single,
                    [single[0] + 0.00001, single[1] + 0.00001],
                ];
            }

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
                yield skipItem(
                    "VALIDATION_ERROR",
                    `Shape validation failed for ${shapeId}: ${shape.summary}`,
                );
            } else {
                yield itemOk(shape as typeof shapes.$inferInsert);
            }
        }

        this.accumulators.clear();
    }
}
