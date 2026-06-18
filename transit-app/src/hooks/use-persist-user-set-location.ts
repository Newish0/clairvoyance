import { DEFAULT_LOCATION } from "@/constants/location";
import { useLocalStorageState } from "ahooks";
import { LngLat } from "maplibre-gl";

export function usePersistUserSetLocation() {
    return useLocalStorageState("userSetLocation", {
        defaultValue: DEFAULT_LOCATION,
        deserializer: (json: string) => {
            const { lng, lat } = JSON.parse(json);
            return new LngLat(lng, lat);
        },
        serializer: (lngLat) => {
            return JSON.stringify({
                lng: lngLat.lng,
                lat: lngLat.lat,
            });
        },
    });
}
