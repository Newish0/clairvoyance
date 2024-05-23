import { getQueryParams, updateQueryParam } from "@/utils/url";
import { atom, computed, type ReadableAtom } from "nanostores";
import { $globalNavParams, setGlobalNavParams } from "./navigationparams";

export interface Location {
    lat: number;
    lng: number;
    radius: number;
}

export const $globalLocation: ReadableAtom<Location> = computed($globalNavParams, (params) => ({
    lat: Number(params.lat ?? 48.4739178),
    lng: Number(params.lng ?? -123.3510237),
    radius: Number(params.radius ?? 1),
}));

export function setGlobalLocation(newPartialLoc: Partial<Location>) {
    const newLoc = { ...$globalLocation.get(), ...newPartialLoc };

    setGlobalNavParams({
        lat: newLoc.lat.toString(),
        lng: newLoc.lng.toString(),
        radius: newLoc.radius.toString(),
    });
}
