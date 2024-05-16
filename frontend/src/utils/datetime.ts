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
