import { getQueryParams, updateQueryParam } from "@/utils/url";
import { atom } from "nanostores";

export interface Location {
    lat: number;
    lng: number;
    radius: number;
}

export const $globalLocation = atom<Location>({
    lat: Number(getQueryParams("lat") ?? 48.4739178),
    lng: Number(getQueryParams("lng") ?? -123.3510237),
    radius: Number(getQueryParams("radius") ?? 1),
});

export function setGlobalLocation(
    newPartialLoc: Partial<Location>,
    { syncUrlParam = true }: { syncUrlParam?: boolean } = {}
) {
    const newLoc = { ...$globalLocation.get(), ...newPartialLoc };
    $globalLocation.set(newLoc);
    if (syncUrlParam) {
        updateQueryParam("lat", newLoc.lat.toString());
        updateQueryParam("lng", newLoc.lng.toString());
        updateQueryParam("radius", newLoc.radius.toString());
    }
}
