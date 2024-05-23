// -- Table: calendar_dates
// CREATE TABLE IF NOT EXISTS calendar_dates (
//     service_id varchar(255) NOT NULL,
//     date integer NOT NULL,
//     exception_type integer CHECK(
//         exception_type >= 1
//         AND exception_type <= 2
//     ) NOT NULL,
//     holiday_name varchar(255) COLLATE NOCASE,
//     PRIMARY KEY (service_id, date)

import { relations } from "drizzle-orm";
import { integer, pgTable, primaryKey, varchar } from "drizzle-orm/pg-core";
import { trips } from "./trips";

// );
export const calendar_dates = pgTable(
    "calendar_dates",
    {
        service_id: varchar("service_id", { length: 255 }).notNull(),
        date: integer("date").notNull(),

        /*
         * Indicates whether service is available on the date specified in the date field. Valid options are:
         * 1 - Service has been added for the specified date.
         * 2 - Service has been removed for the specified date.
         */
        exception_type: integer("exception_type").notNull(),
    },
    (calendar_dates) => {
        return {
            primaryKey: primaryKey({ columns: [calendar_dates.service_id, calendar_dates.date] }),
        };
    }
);

export const calendarDatesRelations = relations(calendar_dates, ({ many }) => ({
    // trips: many(trips),
}));
