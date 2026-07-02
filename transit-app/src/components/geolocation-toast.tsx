// lib/geolocation-toast.ts
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const DISMISSED_KEY = "geolocation-toast-dismissed";

function wasDismissedThisSession(): boolean {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(DISMISSED_KEY) === "true";
}

function markDismissedThisSession(): void {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(DISMISSED_KEY, "true");
}

export function showGeolocationToast(requestPermission: () => void): string | number | null {
    if (wasDismissedThisSession()) {
        return null;
    }

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
            <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                    markDismissedThisSession();
                    toast.dismiss(toastId);
                }}
            >
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
