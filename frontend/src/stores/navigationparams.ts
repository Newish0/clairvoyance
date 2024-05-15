import { getAllQueryParams, getQueryParams, updateQueryParam } from "@/utils/url";
import { atom } from "nanostores";

export interface NavigationParams {
    lat?: string;
    lng?: string;
    radius?: string;
    routeId?: string;
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
}
