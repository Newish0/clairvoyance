export const isFpEqual = (a: number, b: number, epsilon = 0.0001) => Math.abs(a - b) < epsilon;
