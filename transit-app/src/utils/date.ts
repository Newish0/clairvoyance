import { isAfter, subMinutes, type DateArg } from "date-fns";

/**
 * Checks if a given date is no older than 5 minutes from the current time.
 * @param {Date} date - The date to check.
 * @returns {boolean} - True if the date is within the last 5 minutes, false otherwise.
 */
export function isDateNoOlderThan5Minutes(date: DateArg<Date>): boolean {
    const now = new Date();
    const fiveMinutesAgo = subMinutes(now, 5);
    return isAfter(date, fiveMinutesAgo);
}

export function isDataRealtime(date: DateArg<Date>): boolean {
    return isDateNoOlderThan5Minutes(date);
}
