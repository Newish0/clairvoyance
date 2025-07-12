export const mostCommonValue = <T>(values: T[]) => {
    const counts = new Map<T, number>();
    for (const value of values) {
        const count = counts.get(value) ?? 0;
        counts.set(value, count + 1);
    }
    return counts
        .entries()
        .toArray()
        .sort((a, b) => b[1] - a[1])[0][0];
};
