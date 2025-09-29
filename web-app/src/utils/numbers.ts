export const isFpEqual = (a: number, b: number, epsilon = 0.0001) => Math.abs(a - b) < epsilon;

export const tryParseInt = (str: string) => {
    if (str) {
        return parseInt(str);
    }
};
