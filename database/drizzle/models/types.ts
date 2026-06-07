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
export type TimePeriod =
    | { start: number; end: number }
    | { start: null; end: number }
    | { start: number; end: null };

export type EntitySelector = {
    agencyId?: string;
    routeId?: number;
    routeType?: RouteType;
    direction?: Direction;
    tripInstanceId?: number;
    stopId?: number;
};
