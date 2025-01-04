import { parseISO, differenceInMinutes, differenceInSeconds } from "date-fns";

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
export function parseGTFSTimeString(gtfsTimeStr: string) {
    const [hours, minutes, seconds] = gtfsTimeStr.split(":").map(Number);
    if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) {
        return { valid: false, originalTime: gtfsTimeStr };
    }

    const normalizedTime = parse(
        `${(hours % 24).toString().padStart(2, "0")}:${minutes
            .toString()
            .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`,
        "HH:mm:ss",
        // new Date(2024, 0, 1)
        new Date()
    );

    return isValid(normalizedTime)
        ? {
              valid: true,
              originalTime: gtfsTimeStr,
              normalized: normalizedTime,
              extraDays: Math.floor(hours / 24),
          }
        : { valid: false, originalTime: gtfsTimeStr };
}

export function getArrivalMinutes(arrivalTime: string, arrivalDelaySec: number = 0): number {
    const now = new Date();

    const parsedArrivalTime = parseGTFSTimeString(arrivalTime);
    console.log(arrivalTime, parseISO(arrivalTime), parsedArrivalTime);

    if (!parsedArrivalTime.valid || !parsedArrivalTime.normalized) return NaN;

    const arrival = parsedArrivalTime.normalized;
    const diffSeconds = differenceInSeconds(arrival, now);
    const correctedDiffSeconds =
        diffSeconds >= 0
            ? diffSeconds
            : differenceInSeconds(arrival.setDate(arrival.getDate() + 1), now);

    return Math.floor((correctedDiffSeconds + arrivalDelaySec) / 60);
}
