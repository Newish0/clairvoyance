import type { GeolocationState } from "@/components/geolocation-provider";
import { showGeolocationDeniedToast, showGeolocationToast } from "@/components/geolocation-toast";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

export function useGeolocationToast(geolocation: GeolocationState) {
    const geolocationToastId = useRef<string | number | null>(null);

    useEffect(() => {
        if (geolocation.status === "idle") {
            if (geolocationToastId.current) return;
            geolocationToastId.current = showGeolocationToast(geolocation.requestPermission);
        } else if (geolocation.status === "denied") {
            if (geolocationToastId.current) toast.dismiss(geolocationToastId.current);
            geolocationToastId.current = showGeolocationDeniedToast();
        } else if (geolocation.status === "watching") {
            if (geolocationToastId.current) {
                toast.dismiss(geolocationToastId.current);
                geolocationToastId.current = null;
            }
        }
    }, [geolocation.status, geolocation.requestPermission]);
}
