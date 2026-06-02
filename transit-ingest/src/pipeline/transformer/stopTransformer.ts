import type { Transform } from "../core/pipe";
import { stops } from "database/models/tables";
import type { CsvRow } from "../source/csvFileSource";
import type { Context } from "../core/context";
import { createInsertSchema } from "drizzle-orm/arktype";
import { type as akType } from "arktype";
import { sql } from "drizzle-orm";
import { recoverableError } from "../core/error";
import { type locationTypeEnum, type wheelchairBoardingEnum } from "database/models/enums";

const LOCATION_TYPE_MAPPING: Record<string, (typeof locationTypeEnum.enumValues)[number]> = {
    "0": "STOP_OR_PLATFORM",
    "1": "STATION",
    "2": "ENTRANCE_EXIT",
    "3": "GENERIC_NODE",
    "4": "BOARDING_AREA",
};

const WHEELCHAIR_BOARDING_MAPPING: Record<
    string,
    (typeof wheelchairBoardingEnum.enumValues)[number]
> = {
    "0": "NO_INFO",
    "1": "ACCESSIBLE",
    "2": "NOT_ACCESSIBLE",
};

export class StopTransformer implements Transform<CsvRow, typeof stops.$inferInsert> {
    private stopInsertSchema = createInsertSchema(stops, {
        location: akType({
            x: "number",
            y: "number",
        }),
    });

    constructor(public agencyId: string) {}

    async *run(
        ctx: Context,
        input: AsyncIterable<CsvRow>,
    ): AsyncIterable<typeof stops.$inferInsert> {
        type T = typeof this.stopInsertSchema.infer;

        for await (const row of input) {
            const rawLocationType = row["location_type"];
            const locationType = rawLocationType ? LOCATION_TYPE_MAPPING[rawLocationType] : null;

            if (rawLocationType && !locationType) {
                ctx.errors.push(
                    recoverableError(
                        "VALIDATION_ERROR",
                        `Invalid location_type: ${rawLocationType}`,
                    ),
                );
                ctx.skipped++;
                continue;
            }

            const rawWheelchairBoarding = row["wheelchair_boarding"];
            const wheelchairBoarding = rawWheelchairBoarding
                ? WHEELCHAIR_BOARDING_MAPPING[rawWheelchairBoarding]
                : null;

            if (rawWheelchairBoarding && !wheelchairBoarding) {
                ctx.errors.push(
                    recoverableError(
                        "VALIDATION_ERROR",
                        `Invalid wheelchair_boarding: ${rawWheelchairBoarding}`,
                    ),
                );
                ctx.skipped++;
                continue;
            }

            const stopLat = row["stop_lat"];
            const stopLon = row["stop_lon"];
            let location: { x: number; y: number } | null = null;

            if (stopLat && stopLon) {
                const lat = parseFloat(stopLat);
                const lon = parseFloat(stopLon);
                if (!isNaN(lat) && !isNaN(lon)) {
                    location = {
                        x: lon,
                        y: lat,
                    };
                }
            }

            const stop = this.stopInsertSchema({
                agencyId: this.agencyId,
                stopSid: row["stop_id"],
                code: row["stop_code"] ?? null,
                name: row["stop_name"] ?? null,
                description: row["stop_desc"] ?? null,
                location,
                zoneId: row["zone_id"] ?? null,
                url: row["stop_url"] ?? null,
                locationType,
                timezone: row["stop_timezone"] ?? null,
                wheelchairBoarding,
            });

            if (stop instanceof akType.errors) {
                ctx.errors.push(
                    recoverableError(
                        "VALIDATION_ERROR",
                        `Stop row validation failed: ${stop.summary}`,
                    ),
                );
                ctx.skipped++;
            } else {
                yield stop;
            }
        }
    }
}
