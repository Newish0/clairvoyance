export const FIVE_MIN_IN_MS = 5 * 60 * 1000;
export const TWELVE_HOURS_IN_MS = 12 * 60 * 60 * 1000;

export const getTwelveHoursInFuture = () => {
    return new Date(Date.now() + TWELVE_HOURS_IN_MS);
};

export const getFiveMinAgo = () => {
    return new Date(Date.now() - FIVE_MIN_IN_MS);
};
