// lib/geolocation-toast.ts
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function showGeolocationToast(requestPermission: () => void): string | number {
    const toastId = toast("Allow location access", {
        description: "Needed to show nearby stops and real-time transit.",
        duration: 10000000,
        action: (
            <Button
                size="sm"
                onClick={() => {
                    requestPermission();
                    toast.dismiss(toastId);
                }}
            >
                Allow
            </Button>
        ),
        cancel: (
            <Button size="sm" variant="secondary" onClick={() => toast.dismiss(toastId)}>
                Not now
            </Button>
        ),
    });
    return toastId;
}

export function showGeolocationDeniedToast(): string | number {
    return toast.error("Location access denied", {
        description: "Enable it in your browser or device settings.",
        duration: 6000,
    });
}
