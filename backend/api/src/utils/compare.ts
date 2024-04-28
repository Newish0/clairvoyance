/**
 * Compare two records to determine if they are the same.
 * @param {Record<string, any>} record1 - The first record to compare.
 * @param {Record<string, any>} record2 - The second record to compare.
 * @returns {boolean} Returns true if the records have the same keys and values, otherwise false.
 */
export function equalRecords(
    record1: Record<string, any>,
    record2: Record<string, any>
): boolean {
    const keys1 = Object.keys(record1);
    const keys2 = Object.keys(record2);

    // Check if number of keys are the same
    if (keys1.length !== keys2.length) {
        return false;
    }

    // Compare values for each key
    for (const key of keys1) {
        if (record1[key] !== record2[key]) {
            return false;
        }
    }

    return true;
}
