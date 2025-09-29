/**
 * Create a string of query parameters from a record that matches the API expected format.
 *
 * @example
 * recordToSearchParams({ route: "1", stop: "2", arr: ["one", "two"] }) => "route=1&stop=2&arr=one&arr=two"
 *
 * @param record
 * @returns
 */
export const recordToSearchParams = (
    record: Record<string, any | any[]>,
    omitUndefinedAndNull = false
) => {
    const queries: string[] = [];
    for (const [key, value] of Object.entries(record)) {
        if (Array.isArray(value)) {
            for (const val of value) {
                if (omitUndefinedAndNull && (val === undefined || val === null)) continue;
                queries.push(`${key}=${val}`);
            }
        } else {
            if (omitUndefinedAndNull && (value === undefined || value === null)) continue;
            queries.push(`${key}=${value}`);
        }
    }
    return queries.join("&");
};

/**
 * A helper function to stringify the values of a record.
 * Very useful for passing in query parameters to Elysia Eden clients.
 * @param record
 * @returns
 */
export const stringifyRecord = (record: Record<string, unknown>): Record<string, string> => {
    return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, `${value}`]));
};
