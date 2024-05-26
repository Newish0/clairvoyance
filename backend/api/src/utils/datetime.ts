export function getSecondsFromHHMMSS(hhmmss: string): number {
    const [hours, minutes, seconds] = hhmmss.split(":").map(Number);
    return hours * 3600 + minutes * 60 + seconds;
}

export function getSecondsSinceStartOfDay(asInt = false): number {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const secondsSinceMidnight = (now.getTime() - startOfDay.getTime()) / 1000;
    return asInt ? Math.floor(secondsSinceMidnight) : secondsSinceMidnight;
}

export function getSecondsSinceStartOfDate(date: Date, asInt = false): number {
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const secondsSinceMidnight = (date.getTime() - startOfDay.getTime()) / 1000;
    return asInt ? Math.floor(secondsSinceMidnight) : secondsSinceMidnight;
}

export function formatDateAsYYYYMMDD(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}${month}${day}`;
}

/**
 *
 * @param yyyymmdd - YYYYMMDD string (i.e. 20240517)
 */
export function getDateFromYYYYMMDD(yyyymmdd: string): Date {
    return new Date(
        parseInt(yyyymmdd.substring(0, 4)),
        parseInt(yyyymmdd.substring(4, 2)) - 1,
        parseInt(yyyymmdd.substring(6, 2))
    );
}

export const SECONDS_IN_A_DAY = 86400;
