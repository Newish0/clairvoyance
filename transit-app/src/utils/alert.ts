import type { AlertEffect } from "database";

export function getStopAlertEffect(effect: AlertEffect | undefined | null): {
    name: string;
    description: string;
} {
    switch (effect) {
        case "NO_SERVICE":
            return {
                name: "Stop Closed",
                description: "No vehicles will be stopping here for the duration of this alert.",
            };

        case "REDUCED_SERVICE":
            return {
                name: "Reduced Service",
                description: "Fewer vehicles than usual will stop here.",
            };

        case "SIGNIFICANT_DELAYS":
            return {
                name: "Delays Expected",
                description:
                    "Vehicles serving this stop are running significantly behind schedule.",
            };

        case "DETOUR":
            return {
                name: "On Detour",
                description: "Vehicles are being rerouted and may not stop here temporarily.",
            };

        case "ADDITIONAL_SERVICE":
            return {
                name: "Extra Service Added",
                description: "Additional trips have been added that serve this stop.",
            };

        case "MODIFIED_SERVICE":
            return {
                name: "Service Changed",
                description:
                    "How this stop is served has changed (e.g. different routes or times).",
            };

        case "OTHER_EFFECT":
            return {
                name: "Other Impact",
                description:
                    "This stop is affected in a way not covered by other categories. See details.",
            };

        case "UNKNOWN_EFFECT":
            return {
                name: "Unspecified Impact",
                description: "This stop is affected, but the nature of the impact isn't specified.",
            };

        case "STOP_MOVED":
            return {
                name: "Stop Relocated",
                description: "This stop has been temporarily moved to a different location.",
            };

        case "NO_EFFECT":
            return {
                name: "Notice Only",
                description: "Informational notice with no actual change to service at this stop.",
            };

        case "ACCESSIBILITY_ISSUE":
            return {
                name: "Accessibility Issue",
                description:
                    "An accessibility feature at this stop (elevator, ramp, etc.) is unavailable.",
            };

        default:
            return {
                name: "UNKNOWN",
                description: "The impact type is not recognized.",
            };
    }
}
