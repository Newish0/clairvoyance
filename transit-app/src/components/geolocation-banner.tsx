import { useState, useEffect } from "react";
import { MapPinIcon, MapPinOffIcon, LoaderCircleIcon, WifiOffIcon } from "lucide-react";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { GeolocationStatus } from "@/hooks/use-geolocation";

export interface GeolocationBannerProps {
    status: GeolocationStatus;
    error: GeolocationPositionError | null;
    onRequestPermission: () => void;
    className?: string;
}

export function GeolocationBanner({
    status,
    error,
    onRequestPermission,
    className,
}: GeolocationBannerProps) {
    const [dismissed, setDismissed] = useState(false);

    // Re-show if status regresses (e.g. permission revoked mid-session)
    useEffect(() => {
        if (status !== "watching" || error) setDismissed(false);
    }, [status, error]);

    const config = getConfig(status, error);

    if (!config || dismissed) return null;

    const Icon = config.icon;

    return (
        <Alert className={className}>
            <Icon />
            <AlertTitle>{config.title}</AlertTitle>
            <AlertDescription>{config.description}</AlertDescription>
            <AlertAction>
                {config.action && (
                    <Button variant="default" onClick={onRequestPermission}>
                        {config.action}
                    </Button>
                )}
                {config.dismissible && (
                    <Button variant="ghost" onClick={() => setDismissed(true)}>
                        Dismiss
                    </Button>
                )}
            </AlertAction>
        </Alert>
    );
}

// ─── Config ───────────────────────────────────────────────────────────────────

type BannerConfig = {
    icon: React.ElementType;
    title: string;
    description: string;
    action?: string;
    dismissible: boolean;
};

function getConfig(
    status: GeolocationStatus,
    error: GeolocationPositionError | null,
): BannerConfig | null {
    if (status === "watching" && !error) return null;

    if (status === "unsupported") {
        return {
            icon: WifiOffIcon,
            title: "Location unavailable",
            description:
                "Your browser or connection doesn't support location access. Enter your location manually.",
            dismissible: true,
        };
    }

    if (status === "denied") {
        return {
            icon: MapPinOffIcon,
            title: "Location access denied",
            description:
                "Enable location permissions in your browser or device settings, then try again.",
            action: "I've updated my settings",
            dismissible: true,
        };
    }

    if (status === "idle") {
        return {
            icon: MapPinIcon,
            title: "Enable location",
            description: "Share your location to see nearby transit options.",
            action: "Enable location access",
            dismissible: true,
        };
    }

    if (status === "requesting") {
        return {
            icon: LoaderCircleIcon,
            title: "Acquiring location…",
            description: "Waiting for your browser's permission prompt.",
            dismissible: false, // mid-flight, dismissing would confuse
        };
    }

    // watching + error (TIMEOUT / POSITION_UNAVAILABLE)
    if (error) {
        return {
            icon: MapPinOffIcon,
            title: "Location temporarily unavailable",
            description:
                error.code === error.TIMEOUT
                    ? "Location request timed out. Check your connection."
                    : "Unable to determine your location right now.",
            action: "Retry",
            dismissible: true,
        };
    }

    return null;
}
