import { getAllQueryParams, getQueryParams, updateQueryParam } from "@/utils/url";
import { atom } from "nanostores";

export interface NavigationParams {
    lat?: string;
    lng?: string;
    radius?: string;
    routeId?: string;
    tripId?: string;
    stopId?: string;
    directionId?: string;
}

export const $globalNavParams = atom<NavigationParams>({
    ...getAllQueryParams(),
});

export function setGlobalNavParams(newPartialNavParams: Partial<NavigationParams>) {
    const newParams = { ...$globalNavParams.get(), ...newPartialNavParams };
    $globalNavParams.set(newParams);

    for (const [key, value] of Object.entries(newParams)) {
        updateQueryParam(key, value.toString());
    }

    return newParams;
}

export function getGlobalNavParamsAsUrlQuery(globalNavParams?: NavigationParams) {
    const params = globalNavParams || $globalNavParams.get();
    return `?${Object.entries(params)
        .map(([key, value]) => `${key}=${value}`)
        .join("&")}`;
}

function isSameObjects(obj1: any, obj2: any) {
    for (const key in obj1) {
        if (obj1[key] !== obj2[key]) {
            return false;
        }
    }
    return true;
}

setInterval(() => {
    const urlParams = getAllQueryParams();
    if (!isSameObjects(urlParams, $globalNavParams.get())) $globalNavParams.set(urlParams);
}, 100);
