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
