


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

export const SECONDS_IN_A_DAY = 86400;
