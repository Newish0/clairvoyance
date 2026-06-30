import { useTheme, type Theme } from "./theme-provider";
import { Button } from "./ui/button";
import { Settings, type SettingSection } from "./ui/settings";
import { useGeolocation, type GeolocationStatus } from "./geolocation-provider";

const locationDescriptions: Record<GeolocationStatus, string> = {
    idle: "Allow the app to access your location",
    requesting: "Requesting location...",
    watching: "Location is active",
    denied: "Location access was denied. Enable it in your browser settings.",
    unsupported: "Geolocation is not supported on this device.",
};

export const AppSettings = () => {
    const { status, requestPermission, stopWatching } = useGeolocation();
    const { theme, setTheme } = useTheme();

    const location = status === "watching" || status === "requesting";

    const settingsSections: SettingSection[] = [
        {
            title: "Appearance",
            description: "Customize how the app looks",
            settings: [
                {
                    id: "theme",
                    type: "select",
                    label: "Theme",
                    description: "Choose your preferred theme",
                    value: theme,
                    onChange: (value) => setTheme(value as Theme),
                    options: [
                        { label: "Light", value: "light" },
                        { label: "Dark", value: "dark" },
                        { label: "System", value: "system" },
                    ],
                    placeholder: "Select theme",
                },
            ],
        },
        {
            title: "Privacy",
            description: "Manage your privacy settings",
            settings: [
                {
                    id: "location",
                    type: "switch",
                    label: "Location",
                    description:
                        locationDescriptions[status] ?? "Allow the app to access your location",
                    value: location,
                    disabled: status === "unsupported" || status === "denied",
                    onChange: (enabled) => {
                        if (enabled) {
                            requestPermission();
                        } else {
                            stopWatching();
                        }
                    },
                },
            ],
        },
        {
            title: "Danger Zone",
            description: "Irreversible actions that affect your data",
            settings: [
                {
                    id: "reset-app",
                    type: "custom",
                    label: "Reset App",
                    description:
                        "Deletes all local data and user settings. This action cannot be undone.",
                    render: () => (
                        <Button
                            variant="destructive"
                            onClick={() => {
                                if (
                                    confirm(
                                        "Are you sure? This will delete all local data and settings.",
                                    )
                                ) {
                                    // Reset logic here
                                    console.log("Resetting app...");
                                }
                            }}
                        >
                            Reset App
                        </Button>
                    ),
                },
            ],
        },
    ];

    return (
        <>
            <Settings sections={settingsSections} />
        </>
    );
};
