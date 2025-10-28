import { DEFAULT_LOCATION } from "@/constants/location";
import { useLocalStorage } from "@uidotdev/usehooks";
import { LngLat } from "maplibre-gl";

export function usePersistUserSetLocation() {
    const [_userSetLocation, _saveUserSetLocation] = useLocalStorage("userSetLocation", {
        lng: DEFAULT_LOCATION.lng,
        lat: DEFAULT_LOCATION.lat,
    });

    const userSetLocation = new LngLat(_userSetLocation.lng, _userSetLocation.lat);

    const setUserSetLocation = (lngLatOrUpdater: LngLat | ((prev: LngLat) => LngLat)) => {
        const newLngLat =
            typeof lngLatOrUpdater === "function"
                ? lngLatOrUpdater(userSetLocation)
                : lngLatOrUpdater;

        _saveUserSetLocation({ lng: newLngLat.lng, lat: newLngLat.lat });
    };

    console.log("userSetLocation", userSetLocation);

    return [userSetLocation, setUserSetLocation] as const;
}
