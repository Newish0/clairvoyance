import type { AlertEffect } from "database";

export const STOP_ALERT_EFFECT_MAP: Record<AlertEffect, { name: string; description: string }> = {
    NO_SERVICE: {
        name: "Stop Closed",
        description: "No vehicles will be stopping here for the duration of this alert.",
    },
    REDUCED_SERVICE: {
        name: "Reduced Service",
        description: "Fewer vehicles than usual will stop here.",
    },
    SIGNIFICANT_DELAYS: {
        name: "Delays Expected",
        description: "Vehicles serving this stop are running significantly behind schedule.",
    },
    DETOUR: {
        name: "On Detour",
        description: "Vehicles are being rerouted and may not stop here temporarily.",
    },
    ADDITIONAL_SERVICE: {
        name: "Extra Service Added",
        description: "Additional trips have been added that serve this stop.",
    },
    MODIFIED_SERVICE: {
        name: "Service Changed",
        description: "How this stop is served has changed (e.g. different routes or times).",
    },
    OTHER_EFFECT: {
        name: "Other Impact",
        description: "This stop is affected in a way not covered by other categories. See details.",
    },
    UNKNOWN_EFFECT: {
        name: "Unspecified Impact",
        description: "This stop is affected, but the nature of the impact isn't specified.",
    },
    STOP_MOVED: {
        name: "Stop Relocated",
        description: "This stop has been temporarily moved to a different location.",
    },
    NO_EFFECT: {
        name: "Notice Only",
        description: "Informational notice with no actual change to service at this stop.",
    },
    ACCESSIBILITY_ISSUE: {
        name: "Accessibility Issue",
        description: "An accessibility feature at this stop (elevator, ramp, etc.) is unavailable.",
    },
};
