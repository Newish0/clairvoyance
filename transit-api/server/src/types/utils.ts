export type Prettify<T> = {
    [K in keyof T]: T[K];
} & {};

// MongoDB ObjectId type detection
type IsObjectId<T> = T extends { _bsontype: "ObjectId" } ? true : false;

/**
 * Converts a type to its SuperJSON-serialized representation.
 * SuperJSON preserves types that regular JSON doesn't support:
 * - Date objects remain Date
 * - Map<K, V> remains Map<K, V>
 * - Set<T> remains Set<T>
 * - RegExp remains RegExp
 * - BigInt remains bigint
 * - undefined remains undefined
 * - NaN, Infinity, -Infinity remain as number
 * - MongoDB ObjectId becomes string
 * - Functions are still removed (not serializable)
 * - Nested objects are recursively processed
 */
export type AsSuperjsonSerialized<T> = T extends Function
    ? never
    : IsObjectId<T> extends true
    ? string
    : T extends Date | RegExp | Map<any, any> | Set<any>
    ? T
    : T extends bigint
    ? bigint
    : T extends number
    ? number // Preserves NaN, Infinity, -Infinity
    : T extends undefined
    ? undefined
    : T extends object
    ? {
          [K in keyof T as T[K] extends Function ? never : K]: AsSuperjsonSerialized<T[K]>;
      }
    : T;
