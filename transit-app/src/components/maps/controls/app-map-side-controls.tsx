import { MapSideControls } from "./map-side-controls";
import { GeolocateMapControl } from "./geolocate-map-control";
import {
    ResponsiveModal,
    ResponsiveModalContent,
    ResponsiveModalDescription,
    ResponsiveModalHeader,
    ResponsiveModalTitle,
    ResponsiveModalTrigger,
} from "@/components/ui/responsible-dialog";
import { AppSettings } from "@/components/app-settings";
import { Button } from "@/components/ui/button";
import { SettingsIcon, GlobeIcon, GlobeXIcon } from "lucide-react";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { cn } from "@/lib/utils";
import { useOfflineMode } from "@/hooks/use-offline-mode";
import { OfflineAreaManager } from "@/components/offline-area-manager";

/**
 * Reuseable implementation of what all maps of this app
 * should have in the top right corner side controls
 */
export default function AppMapSideControls() {
    return (
        <MapSideControls position="top-right">
            <ResponsiveModal>
                <ResponsiveModalTrigger asChild>
                    <Button variant="secondary" size="icon">
                        <SettingsIcon />
                    </Button>
                </ResponsiveModalTrigger>
                <ResponsiveModalContent className="md:min-w-1/2 md:max-w-3xl max-h-full md:max-h-3/4 flex flex-col">
                    <ResponsiveModalHeader>
                        <ResponsiveModalTitle>Settings</ResponsiveModalTitle>
                        <ResponsiveModalDescription>
                            Manage your preferences
                        </ResponsiveModalDescription>
                    </ResponsiveModalHeader>

                    <div className="h-full pl-4 pr-0 md:p-0 overflow-auto">
                        <AppSettings />
                    </div>
                </ResponsiveModalContent>
            </ResponsiveModal>

            <GeolocateMapControl />

            <OfflineIndicatorBtn />
        </MapSideControls>
    );
}

const OfflineIndicatorBtn = () => {
    const { isOnline } = useOnlineStatus();
    const [offlineModeEnabled] = useOfflineMode();

    return (
        <ResponsiveModal>
            <ResponsiveModalTrigger asChild>
                <Button
                    variant={isOnline ? "secondary" : "warning"}
                    size="icon"
                    title={isOnline ? "Connected to the internet" : "No internet connection"}
                    aria-label=""
                >
                    {isOnline ? <GlobeIcon /> : <GlobeXIcon />}
                </Button>
            </ResponsiveModalTrigger>
            <ResponsiveModalContent className="md:min-w-1/2 md:max-w-3xl max-h-full md:max-h-3/4 flex flex-col">
                <ResponsiveModalHeader>
                    <ResponsiveModalTitle>
                        {isOnline ? "You are online" : "You are offline"}
                    </ResponsiveModalTitle>
                    <ResponsiveModalDescription>
                        {isOnline ? (
                            <>
                                Download an area while you're connected to the internet to use it
                                offline
                            </>
                        ) : (
                            <>
                                Not connected to the internet. Offline data you are seeing is
                                limited to what you have downloaded and may <b>not</b> be up to
                                date.
                            </>
                        )}
                    </ResponsiveModalDescription>
                </ResponsiveModalHeader>

                <div className="h-full p-4 overflow-auto">
                    {!offlineModeEnabled && (
                        <p className="text-warning-foreground text-sm mb-2">
                            Offline mode is not enabled. Please enable it in the settings.
                        </p>
                    )}
                    <div
                        className={cn(
                            "h-full",
                            !offlineModeEnabled && "opacity-50 pointer-events-none",
                        )}
                    >
                        <OfflineAreaManager />
                    </div>
                </div>
            </ResponsiveModalContent>
        </ResponsiveModal>
    );
};
