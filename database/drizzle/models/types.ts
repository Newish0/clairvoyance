// =========================================================
// CUSTOM TYPES
// =========================================================

import type { Direction, RouteType } from "./enums";

export type TranslationMap = {
    default: string; // The base/original text provided by the agency
    [languageCode: string]: string;
};

export type TimePeriod = { start?: string; end?: string };

export type EntitySelector = {
    agencyId?: string;
    routeId?: number;
    routeType?: RouteType;
    direction?: Direction;
    tripInstance?: string;
    stopId?: string;
};
