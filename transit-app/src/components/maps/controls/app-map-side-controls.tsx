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
import { SettingsIcon } from "lucide-react";

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
                <ResponsiveModalContent className="min-w-1/2 max-w-3xl">
                    <ResponsiveModalHeader>
                        <ResponsiveModalTitle>Settings</ResponsiveModalTitle>
                        <ResponsiveModalDescription>
                            Manage your preferences
                        </ResponsiveModalDescription>
                    </ResponsiveModalHeader>
                    <div className="p-4 overflow-auto">
                        <AppSettings />
                    </div>
                </ResponsiveModalContent>
            </ResponsiveModal>

            <GeolocateMapControl />
        </MapSideControls>
    );
}
