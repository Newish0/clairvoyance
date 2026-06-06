import { describe, test, expect } from "bun:test";
import { gtfsTimeToDate } from "./datetime";

/** Format Date as "YYYY-MM-DDTHH:MM:SS" in a given timezone. */
function toLocalISO(date: Date, tz: string): string {
    return new Intl.DateTimeFormat("sv-SE", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    })
        .format(date)
        .replace(" ", "T");
}

describe("gtfsTimeToDate", () => {
    test("parses a regular daytime trip", () => {
        const result = gtfsTimeToDate("20240615", "08:30:00", "America/New_York");
        expect(result).not.toBeNull();
        expect(toLocalISO(result!, "America/New_York")).toBe("2024-06-15T08:30:00");
    });

    test("parses noon exactly", () => {
        const result = gtfsTimeToDate("20240615", "12:00:00", "America/New_York");
        expect(result).not.toBeNull();
        expect(toLocalISO(result!, "America/New_York")).toBe("2024-06-15T12:00:00");
    });

    test("parses midnight (00:00:00)", () => {
        const result = gtfsTimeToDate("20240615", "00:00:00", "America/New_York");
        expect(result).not.toBeNull();
        expect(toLocalISO(result!, "America/New_York")).toBe("2024-06-15T00:00:00");
    });

    test("parses end-of-day 23:59:59", () => {
        const result = gtfsTimeToDate("20240615", "23:59:59", "America/New_York");
        expect(result).not.toBeNull();
        expect(toLocalISO(result!, "America/New_York")).toBe("2024-06-15T23:59:59");
    });

    test("25:10:00 resolves to 1:10 AM the next calendar day", () => {
        const result = gtfsTimeToDate("20240615", "25:10:00", "America/New_York");
        expect(result).not.toBeNull();
        expect(toLocalISO(result!, "America/New_York")).toBe("2024-06-16T01:10:00");
    });

    test("24:00:00 resolves to midnight (start of next day)", () => {
        const result = gtfsTimeToDate("20240615", "24:00:00", "America/New_York");
        expect(result).not.toBeNull();
        expect(toLocalISO(result!, "America/New_York")).toBe("2024-06-16T00:00:00");
    });

    test("27:59:59 resolves to 3:59:59 AM two days into next day", () => {
        const result = gtfsTimeToDate("20240615", "27:59:59", "America/New_York");
        expect(result).not.toBeNull();
        expect(toLocalISO(result!, "America/New_York")).toBe("2024-06-16T03:59:59");
    });

    test("08:00:00 on spring-forward day resolves to 8 AM EDT", () => {
        const result = gtfsTimeToDate("20240310", "08:00:00", "America/New_York");
        expect(result).not.toBeNull();
        expect(toLocalISO(result!, "America/New_York")).toBe("2024-03-10T08:00:00");
        expect(result!.getUTCHours()).toBe(12);
    });

    test("02:30:00 on spring-forward day (gap time — valid UTC)", () => {
        const result = gtfsTimeToDate("20240310", "02:30:00", "America/New_York");
        expect(result).not.toBeNull();
        expect(result!.getUTCHours()).toBe(6);
        expect(result!.getUTCMinutes()).toBe(30);
    });

    test("03:00:00 on spring-forward day resolves correctly (post-spring)", () => {
        const result = gtfsTimeToDate("20240310", "03:00:00", "America/New_York");
        expect(result).not.toBeNull();
        expect(toLocalISO(result!, "America/New_York")).toBe("2024-03-10T03:00:00");
    });

    test("produces correct UTC for a daytime trip on spring-forward day", () => {
        const result = gtfsTimeToDate("20240310", "14:00:00", "America/New_York");
        expect(result).not.toBeNull();
        expect(result!.getUTCHours()).toBe(18);
    });

    test("01:30:00 on fall-back day resolves to the SECOND 1:30 AM (EST)", () => {
        const result = gtfsTimeToDate("20241103", "01:30:00", "America/New_York");
        expect(result).not.toBeNull();
        expect(result!.getUTCHours()).toBe(6);
        expect(result!.getUTCMinutes()).toBe(30);
    });

    test("25:30:00 of Nov 2 resolves to the FIRST 1:30 AM (EDT, pre-rollback)", () => {
        const result = gtfsTimeToDate("20241102", "25:30:00", "America/New_York");
        expect(result).not.toBeNull();
        expect(result!.getUTCHours()).toBe(5);
        expect(result!.getUTCMinutes()).toBe(30);
    });

    test("the two 1:30 AMs are exactly 1 hour apart", () => {
        const first = gtfsTimeToDate("20241102", "25:30:00", "America/New_York");
        const second = gtfsTimeToDate("20241103", "01:30:00", "America/New_York");
        expect(first).not.toBeNull();
        expect(second).not.toBeNull();
        expect(second!.getTime() - first!.getTime()).toBe(60 * 60 * 1000);
    });

    test("08:00:00 on fall-back day resolves to 8 AM EST correctly", () => {
        const result = gtfsTimeToDate("20241103", "08:00:00", "America/New_York");
        expect(result).not.toBeNull();
        expect(toLocalISO(result!, "America/New_York")).toBe("2024-11-03T08:00:00");
        expect(result!.getUTCHours()).toBe(13);
    });

    test("works for Europe/London (BST spring forward)", () => {
        const result = gtfsTimeToDate("20240401", "09:00:00", "Europe/London");
        expect(result).not.toBeNull();
        expect(toLocalISO(result!, "Europe/London")).toBe("2024-04-01T09:00:00");
    });

    test("works for Australia/Sydney", () => {
        const result = gtfsTimeToDate("20240615", "07:45:00", "Australia/Sydney");
        expect(result).not.toBeNull();
        expect(toLocalISO(result!, "Australia/Sydney")).toBe("2024-06-15T07:45:00");
    });

    test("works for UTC (no DST ever)", () => {
        const result = gtfsTimeToDate("20240615", "14:22:00", "UTC");
        expect(result).not.toBeNull();
        expect(result!.getUTCHours()).toBe(14);
        expect(result!.getUTCMinutes()).toBe(22);
    });

    test("works for America/Los_Angeles (PDT summer)", () => {
        const result = gtfsTimeToDate("20240615", "10:00:00", "America/Los_Angeles");
        expect(result).not.toBeNull();
        expect(toLocalISO(result!, "America/Los_Angeles")).toBe("2024-06-15T10:00:00");
        expect(result!.getUTCHours()).toBe(17);
    });

    test("empty time string returns null", () => {
        expect(gtfsTimeToDate("20240315", "", "UTC")).toBeNull();
    });

    test("null time returns null", () => {
        expect(gtfsTimeToDate("20240315", null as any, "UTC")).toBeNull();
    });

    test("undefined time returns null", () => {
        expect(gtfsTimeToDate("20240315", undefined as any, "UTC")).toBeNull();
    });

    test("invalid time format (abc) returns null", () => {
        expect(gtfsTimeToDate("20240315", "abc", "UTC")).toBeNull();
    });

    test("invalid time format (24:61:00) returns null", () => {
        expect(gtfsTimeToDate("20240315", "24:61:00", "UTC")).toBeNull();
    });

    test("invalid timezone returns null", () => {
        expect(gtfsTimeToDate("20240315", "08:00:00", "Fake/Zone")).toBeNull();
    });

    test("handles H:MM:SS format (single-digit hour)", () => {
        const result = gtfsTimeToDate("20240615", "8:30:00", "America/New_York");
        expect(result).not.toBeNull();
        expect(toLocalISO(result!, "America/New_York")).toBe("2024-06-15T08:30:00");
    });

    test("handles year boundary (Dec 31 with 25:00:00 -> Jan 1)", () => {
        const result = gtfsTimeToDate("20231231", "25:00:00", "America/New_York");
        expect(result).not.toBeNull();
        expect(toLocalISO(result!, "America/New_York")).toBe("2024-01-01T01:00:00");
    });

    test("returns a plain Date object", () => {
        const result = gtfsTimeToDate("20240615", "08:00:00", "America/New_York");
        expect(result).toBeInstanceOf(Date);
    });
});
