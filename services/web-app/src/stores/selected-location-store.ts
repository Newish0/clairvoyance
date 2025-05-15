import { atom } from "nanostores";
import { DEFAULT_LOCATION } from "~/constants/location";

type LatLon = {
    latitude: number;
    longitude: number;
};

export const $selectedUserLocation = atom<LatLon>(DEFAULT_LOCATION);
