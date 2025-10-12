import { createFileRoute } from "@tanstack/react-router";

import { HomeMap, type HomeMapProps } from "@/components/maps/home-map";
import { Button } from "@/components/ui/button";
import { SettingsIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/main";
import { useCallback, useState } from "react";
import { useThrottle } from "@uidotdev/usehooks";
import { DepartureBoard } from "@/components/trip-info/departure-board";
import {
    ResponsiveModal,
    ResponsiveModalContent,
    ResponsiveModalDescription,
    ResponsiveModalHeader,
    ResponsiveModalTitle,
    ResponsiveModalTrigger,
} from "@/components/ui/responsible-dialog";
import { AppSettings } from "@/components/app-settings";

export const Route = createFileRoute("/")({
    component: TransitApp,
});

function TransitApp() {
    const [nearbyTripsQueryParams, setNearbyTripsQueryParams] = useState({
        lat: 0,
        lng: 0,
        bbox: { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 },
    });
    const throttledNearbyTripsQueryParams = useThrottle(nearbyTripsQueryParams, 1000);

    const { data: nearbyTrips } = useQuery(
        trpc.trip.getNearby.queryOptions(throttledNearbyTripsQueryParams)
    );

    const handleLocationChange: NonNullable<HomeMapProps["onLocationChange"]> = useCallback(
        (lat, lng, viewBounds) => {
            setNearbyTripsQueryParams((prev) => ({
                ...prev,
                lat,
                lng,
                bbox: {
                    minLat: viewBounds.getSouthWest().lat,
                    maxLat: viewBounds.getNorthEast().lat,
                    minLng: viewBounds.getSouthWest().lng,
                    maxLng: viewBounds.getNorthEast().lng,
                },
            }));
        },
        [setNearbyTripsQueryParams]
    );

    return (
        <div className="h-[100dvh] w-[100dvw] relative">
            <div className="w-full h-full absolute top-0 left-0">
                <HomeMap onLocationChange={handleLocationChange} />
            </div>

            <ResponsiveModal>
                <ResponsiveModalTrigger asChild>
                    <Button variant={"secondary"} size={"icon"} className="absolute top-4 right-4">
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

            <div className="absolute top-0 left-0 h-full w-sm  bg-primary-foreground">
                <DepartureBoard departures={nearbyTrips || null} />
            </div>
        </div>
    );
}
