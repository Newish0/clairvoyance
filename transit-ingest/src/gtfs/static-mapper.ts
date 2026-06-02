import { err, ok, type Result } from "neverthrow";
import type { IngestError } from "../error.ts";
import type { CsvRow } from "./csv-decoder.ts";
import type { agencies, feedInfo, calendarDates } from "database/models/tables";
import type { CalendarExceptionType } from "database/models/enums.ts";

type AgencyInsert = typeof agencies.$inferInsert;
type FeedInfoInsert = typeof feedInfo.$inferInsert;
type CalendarDateInsert = typeof calendarDates.$inferInsert;

const EXCEPTION_MAP: Record<string, CalendarExceptionType> = {
    "1": "ADDED",
    "2": "REMOVED",
};

export function mapAgencyRow(row: CsvRow, agencyId: string): Result<AgencyInsert, IngestError> {
    try {
        return ok({
            id: agencyId,
            agencySid: row["agency_id"] ?? "",
            name: row["agency_name"] ?? "",
            url: row["agency_url"] ?? "",
            timezone: row["agency_timezone"] ?? "",
            lang: row["agency_lang"] ?? null,
            phone: row["agency_phone"] ?? null,
            fareUrl: row["agency_fare_url"] ?? null,
            email: row["agency_email"] ?? null,
        });
    } catch (e) {
        return err({
            severity: "recoverable",
            code: "AGENCY_MAP_FAILED",
            message: "Failed to map agency row",
            cause: e,
        });
    }
}

export function mapFeedInfoRow(
    row: CsvRow,
    agencyId: string,
    feedHash: string,
): Result<FeedInfoInsert, IngestError> {
    try {
        return ok({
            hash: feedHash,
            agencyId,
            publisherName: row["feed_publisher_name"] ?? null,
            publisherUrl: row["feed_publisher_url"] ?? null,
            lang: row["feed_lang"] ?? null,
            version: row["feed_version"] ?? null,
            startDate: row["feed_start_date"] ?? null,
            endDate: row["feed_end_date"] ?? null,
        });
    } catch (e) {
        return err({
            severity: "recoverable",
            code: "FEED_INFO_MAP_FAILED",
            message: "Failed to map feed_info row",
            cause: e,
        });
    }
}

export function mapCalendarDateRow(
    row: CsvRow,
    agencyId: string,
): Result<CalendarDateInsert, IngestError> {
    try {
        const rawException = row["exception_type"]?.trim();
        const exceptionType = EXCEPTION_MAP[rawException ?? ""];

        if (!exceptionType) {
            return err({
                severity: "recoverable",
                code: "INVALID_EXCEPTION_TYPE",
                message: `Unknown exception_type: ${rawException}`,
            });
        }

        const serviceSid = row["service_id"]?.trim();
        const date = row["date"]?.trim();

        if (!serviceSid) {
            return err({
                severity: "recoverable",
                code: "MISSING_SERVICE_ID",
                message: "calendar_dates row missing service_id",
            });
        }
        if (!date) {
            return err({
                severity: "recoverable",
                code: "MISSING_DATE",
                message: "calendar_dates row missing date",
            });
        }

        return ok({
            agencyId,
            serviceSid,
            date,
            exceptionType,
        });
    } catch (e) {
        return err({
            severity: "recoverable",
            code: "CALENDAR_DATE_MAP_FAILED",
            message: "Failed to map calendar_date row",
            cause: e,
        });
    }
}
