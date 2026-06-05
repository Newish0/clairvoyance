// =========================================================
// CUSTOM TYPES
// =========================================================

import type { Direction, RouteType } from "./enums";

export type TranslationMap = {
    default: string; // The base/original text provided by the agency
    [languageCode: string]: string;
};

/** 
 * POSIX time.
 */
export type TimePeriod = { start: bigint; end: bigint };

export type EntitySelector = {
    agencyId?: string;
    routeId?: number;
    routeType?: RouteType;
    direction?: Direction;
    tripInstance?: string;
    stopId?: string;
};
