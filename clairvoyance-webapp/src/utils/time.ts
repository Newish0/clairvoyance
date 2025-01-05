import { parseISO, differenceInMinutes, differenceInSeconds, isPast, addSeconds } from "date-fns";

import { parse, isValid, addDays } from "date-fns";

/**
 * Parses a time string in HH:mm:ss format, handling cases beyond 24 hours
 *
 * @param gtfsTimeStr - Time string in format "HH:mm:ss"
 * @returns Result object containing:
 *   - valid - Whether the time string was successfully parsed
 *   - originalTime - The input time string
 *   - normalized - [If valid] Date object with normalized time
 *   - extraDays - [If valid] Number of extra days for times beyond 24h
 *
 * @example
 * parseTimeString('15:30:00') // Normal time
 * // => { valid: true, originalTime: '15:30:00', normalized: Date, extraDays: 0 }
 *
 * parseTimeString('26:30:00') // Beyond 24h
 * // => { valid: true, originalTime: '26:30:00', normalized: Date, extraDays: 1 }
 *
 * parseTimeString('invalid')
 * // => { valid: false, originalTime: 'invalid' }
 */
// export function parseGTFSTimeString(gtfsTimeStr: string) {
//     const [hours, minutes, seconds] = gtfsTimeStr.split(":").map(Number);
//     if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) {
//         return { valid: false, originalTime: gtfsTimeStr };
//     }

//     const normalizedTime = parse(
//         `${(hours % 24).toString().padStart(2, "0")}:${minutes
//             .toString()
//             .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`,
//         "HH:mm:ss",
//         // new Date(2024, 0, 1)
//         new Date()
//     );

//     return isValid(normalizedTime)
//         ? {
//               valid: true,
//               originalTime: gtfsTimeStr,
//               normalized: normalizedTime,
//               extraDays: Math.floor(hours / 24),
//           }
//         : { valid: false, originalTime: gtfsTimeStr };
// }

/**
 * Decomposes a time string into hours, minutes, and seconds
 * @param time - Time string in format "HH:mm:ss"
 * @returns Object containing hours, minutes, and seconds
 */
export function decomposeTime(time: string) {
    const [hours, minutes, seconds] = time.split(":").map(Number);
    return { hours, minutes, seconds };
}

/**
 * Checks if a time string represents a late night service (24:00:00 or later)
 * @param time - Time string in format "HH:mm:ss"
 * @returns `true` if the time represents a late night service, `false` otherwise
 * @throws {Error} If the time string is invalid
 */
function isLateNightService(time: string): boolean {
    const { hours, minutes, seconds } = decomposeTime(time);
    if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) {
        throw new Error("Invalid time format. Expected HH:mm:ss");
    }
    return hours >= 24;
}

/**
 * Calculates the number of extra days based on hours >= 24
 * @param time - Time string in format "HH:mm:ss"
 * @returns Number of extra days
 * @throws {Error} If the time string is invalid
 */
function getNumberOfExtraDays(time: string): number {
    const [hour] = time.split(":").map(Number);
    if (isNaN(hour)) {
        throw new Error("Invalid time format. Expected HH:mm:ss");
    }
    return Math.floor(hour / 24);
}

/**
 * Normalizes a time string by converting hours >= 24 to equivalent 24-hour time
 * @param time - Time string in format "HH:mm:ss"
 * @returns Normalized time string in format "HH:mm:ss"
 * @throws {Error} If the time string is invalid
 */
function getNormalizedTime(time: string): string {
    const { hours: hour, minutes: min, seconds: sec } = decomposeTime(time);
    if (isNaN(hour) || isNaN(min) || isNaN(sec)) {
        throw new Error("Invalid time format. Expected HH:mm:ss");
    }
    if (min < 0 || min > 59 || sec < 0 || sec > 59) {
        throw new Error("Invalid minutes or seconds. Must be between 0 and 59");
    }
    return hhmmssToString(hour % 24, min, sec);
}

/**
 * Converts hours, minutes, and seconds to a formatted time string
 * @param hour - Hours (0-Inf)
 * @param min - Minutes (0-59)
 * @param sec - Seconds (0-59)
 * @returns Formatted time string in "HH:mm:ss" format
 */
export function hhmmssToString(hour: number, min: number, sec: number): string {
    return `${hour.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}:${sec
        .toString()
        .padStart(2, "0")}`;
}

/**
 * Calculates the number of minutes until an arrival time, accounting for delays
 * and late night services
 * @param arrivalTime - Time string in format "HH:mm:ss"
 * @param arrivalDelaySec - Delay in seconds (positive for delays, negative for early arrivals)
 * @param clamped - If true, negative values will be clamped to 0
 * @returns Number of minutes until arrival
 * @throws {Error} If the time string is invalid
 */
export function getArrivalMinutes(
    arrivalTime: string,
    arrivalDelaySec: number = 0,
    clamped = true
): number {
    const now = new Date();
    const normalizedArrivalTime = parse(getNormalizedTime(arrivalTime), "HH:mm:ss", now);
    const correctedArrivalTime = addSeconds(normalizedArrivalTime, arrivalDelaySec); // Add delay

    if (isLateNightService(arrivalTime) && isPast(correctedArrivalTime)) {
        const extraDays = getNumberOfExtraDays(arrivalTime);
        correctedArrivalTime.setDate(correctedArrivalTime.getDate() + extraDays);
    }

    const diffSeconds = differenceInSeconds(correctedArrivalTime, now);

    if (clamped) {
        return Math.max(0, Math.floor(diffSeconds / 60));
    }

    return Math.floor(diffSeconds / 60);
}
