export const FIVE_MIN_IN_MS = 5 * 60 * 1000;
export const TWELVE_HOURS_IN_MS = 12 * 60 * 60 * 1000;


const hrToMs = (hr: number) => hr * 60 * 60 * 1000;

export const getHoursInFuture = (numberOfHours: number) => {
    return new Date(Date.now() + hrToMs(numberOfHours));
};

export const getFiveMinAgo = () => {
    return new Date(Date.now() - FIVE_MIN_IN_MS);
};
