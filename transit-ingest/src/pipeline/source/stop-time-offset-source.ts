import * as tables from "database/models/tables";
import { asc, eq } from "drizzle-orm";
import type { Context } from "../core/context";
import { type ItemResult, itemOk } from "../core/error";
import type { Source } from "../core/pipe";

type StopTime = typeof tables.stopTimes.$inferInsert;

function parseTimeToSeconds(time: string | null): number {
    if (!time) return 0;
    const parts = time.split(":");
    return parseInt(parts[0]!) * 3600 + parseInt(parts[1]!) * 60 + parseInt(parts[2]!);
}

function computeOffset(time: string | null, firstTime: string | null): string | null {
    if (!time || !firstTime) return null;
    const sec = parseTimeToSeconds(time) - parseTimeToSeconds(firstTime);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Reads stop_times ordered by (trip_id, stop_sequence) and yields full rows
 * with relative_arrival_offset / relative_departure_offset populated.
 *
 * Processes trips atomically across batch boundaries: accumulates a trip's
 * stop times until the trip_id changes, then yields all its rows with offsets
 * computed against the first stop's arrival_time.
 */
export class StopTimeOffsetSource implements Source<StopTime> {
    constructor(
        public agencyId: string,
        public batchSize: number = 10000,
    ) {}

    async *run(ctx: Context): AsyncIterable<ItemResult<StopTime>> {
        let offset = 0;
        let pendingTripId: number | null = null;
        let pendingStops: StopTime[] = [];

        const flushTrip = function* (stops: StopTime[]) {
            stops.sort((a, b) => (a.stopSequence ?? 0) - (b.stopSequence ?? 0));
            const firstArrival = stops[0]?.arrivalTime ?? null;
            for (const st of stops) {
                yield itemOk({
                    ...st,
                    relativeArrivalOffset: computeOffset(st.arrivalTime ?? null, firstArrival),
                    relativeDepartureOffset: computeOffset(st.departureTime ?? null, firstArrival),
                });
            }
        };

        let batch = await this.getBatch(ctx, offset, this.batchSize);
        while (batch.length > 0) {
            for (const st of batch) {
                if (st.tripId !== pendingTripId && pendingStops.length > 0) {
                    yield* flushTrip(pendingStops);
                    pendingStops = [];
                }
                pendingTripId = st.tripId;
                pendingStops.push(st);
            }
            offset += this.batchSize;
            batch = await this.getBatch(ctx, offset, this.batchSize);
        }
        // Flush last trip
        if (pendingStops.length > 0) {
            yield* flushTrip(pendingStops);
        }
    }

    private async getBatch(ctx: Context, offset: number, limit: number) {
        return await ctx.db
            .select()
            .from(tables.stopTimes)
            .where(eq(tables.stopTimes.agencyId, this.agencyId))
            .orderBy(asc(tables.stopTimes.tripId), asc(tables.stopTimes.stopSequence))
            .limit(limit)
            .offset(offset);
    }
}
