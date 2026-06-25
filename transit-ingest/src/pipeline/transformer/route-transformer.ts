import type { Transform } from "../core/pipe";
import { routes } from "database/models/tables";
import type { CsvRow } from "../source/csv-file-source";
import type { Context } from "../core/context";
import { createInsertSchema } from "drizzle-orm/arktype";
import { type as akType } from "arktype";
import { type ItemResult, itemOk, skipItem } from "../core/error";
import { type routeTypeEnum } from "database/models/enums";

const ROUTE_TYPE_MAPPING: Record<string, (typeof routeTypeEnum.enumValues)[number]> = {
    "0": "TRAM",
    "1": "SUBWAY",
    "2": "RAIL",
    "3": "BUS",
    "4": "FERRY",
    "5": "CABLE_TRAM",
    "6": "AERIAL_LIFT",
    "7": "FUNICULAR",
    "11": "TROLLEYBUS",
    "12": "MONORAIL",
};

export class RouteTransformer implements Transform<CsvRow, typeof routes.$inferInsert> {
    private routeInsertSchema = createInsertSchema(routes);

    constructor(public agencyId: string) {}

    async *run(
        ctx: Context,
        input: AsyncIterable<CsvRow>,
    ): AsyncIterable<ItemResult<typeof routes.$inferInsert>> {
        for await (const row of input) {
            const rawRouteType = row["route_type"];
            const routeType = rawRouteType ? ROUTE_TYPE_MAPPING[rawRouteType] : null;

            if (!routeType) {
                yield skipItem("VALIDATION_ERROR", `Invalid route_type: ${rawRouteType}`);
                continue;
            }

            const route = this.routeInsertSchema({
                agencyId: this.agencyId,
                routeSid: row["route_id"],
                type: routeType,
                shortName: row["route_short_name"] || null,
                longName: row["route_long_name"] || null,
                color: row["route_color"] || null,
                textColor: row["route_text_color"] || null,
            });

            if (route instanceof akType.errors) {
                yield skipItem("VALIDATION_ERROR", `Route row validation failed: ${route.summary}`);
            } else {
                yield itemOk(route);
            }
        }
    }
}
