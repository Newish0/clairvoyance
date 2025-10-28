import { createFileRoute } from "@tanstack/react-router";

import { AppSettings } from "@/components/app-settings";
import { HomeMap, type HomeMapProps } from "@/components/maps/home-map";
import { DepartureBoard } from "@/components/trip-info/departure-board";
import { Button } from "@/components/ui/button";
import {
    ResponsiveModal,
    ResponsiveModalContent,
    ResponsiveModalDescription,
    ResponsiveModalHeader,
    ResponsiveModalTitle,
    ResponsiveModalTrigger,
} from "@/components/ui/responsible-dialog";
import { trpc } from "@/main";
import { limitBBox } from "@/utils/geo";
import { useQuery } from "@tanstack/react-query";
import { useThrottle } from "@uidotdev/usehooks";
import { SettingsIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import z from "zod";

const SearchSchema = z.object({
    lat: z.number().optional(),
    lng: z.number().optional(),
});

export const Route = createFileRoute("/")({
    component: TransitApp,
    validateSearch: SearchSchema,
});

function TransitApp() {
    // const { lat = undefined, lng = undefined } = Route.useSearch();

    const [nearbyTripsQueryParams, setNearbyTripsQueryParams] = useState({
        lat: 0,
        lng: 0,
        bbox: { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 },
    });
    const throttledNearbyTripsQueryParams = useThrottle(nearbyTripsQueryParams, 1000);

    const { data: nearbyTrips, refetch: refetchNearbyTrips } = useQuery({
        ...trpc.tripInstance.getNearby.queryOptions(throttledNearbyTripsQueryParams),
        staleTime: 0,
        gcTime: 0,
        placeholderData: (prev) => prev, // prevent flickering
    });
    const nearbyTripsRefetchIntervalId = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        nearbyTripsRefetchIntervalId.current = setInterval(() => {
            refetchNearbyTrips();
        }, 60000);
        return () => {
            if (nearbyTripsRefetchIntervalId.current) {
                clearInterval(nearbyTripsRefetchIntervalId.current);
            }
        };
    }, [nearbyTripsRefetchIntervalId, refetchNearbyTrips]);

    const handleLocationChange: NonNullable<HomeMapProps["onLocationChange"]> = useCallback(
        (lat, lng, viewBounds) => {
            setNearbyTripsQueryParams((prev) => ({
                ...prev,
                lat,
                lng,
                bbox: limitBBox(
                    {
                        minLat: viewBounds.getSouthWest().lat,
                        maxLat: viewBounds.getNorthEast().lat,
                        minLng: viewBounds.getSouthWest().lng,
                        maxLng: viewBounds.getNorthEast().lng,
                    },
                    0.03
                ),
            }));
        },
        [setNearbyTripsQueryParams]
    );

    return (
        <div className="h-dvh w-dvw relative overflow-clip">
            <div className="w-full md:w-[calc(100%+var(--container-sm))] h-full absolute top-0 left-0">
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

            <div className="absolute top-4 left-4 max-h-[calc(100dvh-2rem)] w-sm p-2 overflow-auto rounded-md bg-primary-foreground/60 backdrop-blur-md">
                <DepartureBoard departures={nearbyTrips || null} />
            </div>
        </div>
    );
}
