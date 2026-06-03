import { TZDate } from "@date-fns/tz";

// GTFS time: HHH:MM:SS offset from "noon minus 12h" of service day.
// Hours > 24 = next-day service. Safe range: 03:00–27:00 avoids DST ambiguity.
const TIME_RE = /^\s*(\d+):([0-5]\d):([0-5]\d)\s*$/;

/**
 * Convert GTFS service date + time + timezone to a Date.
 *
 * Uses the "noon minus 12h" rule: construct noon in the agency timezone
 * via TZDate, subtract 12h to get the GTFS epoch, add parsed time offset.
 * DST is handled automatically by TZDate's UTC-anchored arithmetic.
 *
 * Fall-back note: 01:30:00 on the transition day = second (post-rollback)
 * occurrence. Use 25:30:00 of the previous day for the first occurrence.
 */
export function gtfsTimeToDate(
    serviceDate: string,
    gtfsTime: string,
    timeZone: string,
): Date | null {
    try {
        const m = TIME_RE.exec(gtfsTime);
        if (!m || !m[1] || !m[2] || !m[3]) return null;

        const year = parseInt(serviceDate.slice(0, 4), 10);
        const month = parseInt(serviceDate.slice(4, 6), 10) - 1;
        const day = parseInt(serviceDate.slice(6, 8), 10);

        const noonLocal = new TZDate(year, month, day, 12, 0, 0, timeZone);
        if (isNaN(noonLocal.getTime())) return null;

        const epochSeconds = noonLocal.getTime() / 1000 - 12 * 3600;
        const offsetSeconds =
            parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10);

        return new Date((epochSeconds + offsetSeconds) * 1000);
    } catch {
        return null;
    }
}
