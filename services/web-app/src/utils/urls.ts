/**
 * Create a string of query parameters from a record that matches the API expected format.
 *
 * @example
 * recordToSearchParams({ route: "1", stop: "2", arr: ["one", "two"] }) => "route=1&stop=2&arr=one&arr=two"
 *
 * @param record
 * @returns
 */
export const recordToSearchParams = (record: Record<string, any | any[]>) => {
    const queries: string[] = [];
    for (const [key, value] of Object.entries(record)) {
        if (Array.isArray(value)) {
            for (const val of value) {
                queries.push(`${key}=${val}`);
            }
        } else {
            queries.push(`${key}=${value}`);
        }
    }
    return queries.join("&");
};
