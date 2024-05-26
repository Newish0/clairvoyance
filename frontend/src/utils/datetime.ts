export function getSecondsSinceStartOfDay(asInt = false): number {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const secondsSinceMidnight = (now.getTime() - startOfDay.getTime()) / 1000;
    return asInt ? Math.floor(secondsSinceMidnight) : secondsSinceMidnight;
}

export const SECONDS_IN_A_DAY = 86400;

export function formatHHMMSSFromSeconds(seconds: number): string {
    const date = new Date(0);
    date.setSeconds(seconds);
    return (
        date.getUTCHours().toString().padStart(2, "0") +
        ":" +
        date.getUTCMinutes().toString().padStart(2, "0") +
        ":" +
        date.getUTCSeconds().toString().padStart(2, "0")
    );
}

export function secondsUntilTime(secSinceMidnight: number, loopAroundThreshold = 0): number {
    // Normalize the given seconds to within one day
    const normalizedGivenSeconds = secSinceMidnight % SECONDS_IN_A_DAY;

    // Calculate current seconds since 12 AM
    const curSecondsSinceMidnight = getSecondsSinceStartOfDay();

    // Calculate the difference
    let secondsUntil = normalizedGivenSeconds - curSecondsSinceMidnight;

    // If the result is negative, adjust for the next day
    if (secondsUntil < loopAroundThreshold) {
        secondsUntil += SECONDS_IN_A_DAY; // 24 * 60 * 60
    }

    return secondsUntil;
}



export function formatDateAsYYYYMMDD(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}${month}${day}`;
}