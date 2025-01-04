import { deepMap, listenKeys } from "nanostores";
import { DEFAULT_LOCATION } from "~/constants/location";

type LatLon = {
    lat: number;
    lon: number;
};

export const $userLocation = deepMap<{
    /* The location the user selected. Same as `gps` if user did not alter the center.  */
    current: LatLon;

    /* The location the of the device/user's GPS */
    gps?: LatLon;
}>({
    current: DEFAULT_LOCATION,
    gps: undefined,
});
