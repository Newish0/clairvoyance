import type { Transform } from "../core/pipe";
import { tripInstances } from "database/models/tables";
import type { Context } from "../core/context";
import { createInsertSchema } from "drizzle-orm/arktype";
import { type as akType } from "arktype";
import { type ItemResult, itemOk, skipItem } from "../core/error";
import { gtfsTimeToDate } from "../../utils/datetime";
import type { TripInstanceRow } from "../source/trip-instance-source";

/** Maps TripInstanceRow tuples to trip_instances insert objects with validation. */
export class TripInstanceTransformer implements Transform<
    TripInstanceRow,
    typeof tripInstances.$inferInsert
> {
    private tripInstanceInsertSchema = createInsertSchema(tripInstances);

    async *run(
        ctx: Context,
        input: AsyncIterable<TripInstanceRow>,
    ): AsyncIterable<ItemResult<typeof tripInstances.$inferInsert>> {
        for await (const row of input) {
            const { agency, date, state, trip, stopTime, route, shape } = row;

            const startTime = stopTime.arrivalTime ?? stopTime.departureTime;
            if (!startTime) continue;

            const startDatetime = gtfsTimeToDate(date, startTime, agency.timezone);

            const insertObj = this.tripInstanceInsertSchema({
                agencyId: agency.id,
                tripId: trip.id,
                routeId: route?.id ?? trip.routeId!,
                shapeId: shape?.id ?? trip.shapeId ?? null,
                startDate: date,
                startTime,
                startDatetime: startDatetime ?? undefined,
                state,
            });

            if (insertObj instanceof akType.errors) {
                yield skipItem("VALIDATION_ERROR", `Validation failed: ${insertObj.summary}`);
            } else {
                yield itemOk(insertObj);
            }
        }
    }
}
