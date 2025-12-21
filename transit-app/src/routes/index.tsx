import { createFileRoute, useRouter } from "@tanstack/react-router";

import { AppSettings } from "@/components/app-settings";
import { ExploreMap, type ExploreMapProps } from "@/components/maps/explore-map";
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
import { Loader, Loader2, MapPin, PinIcon, SettingsIcon, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import z from "zod";
import { LngLat } from "maplibre-gl";
import { cn } from "@/lib/utils";

const SearchSchema = z.object({
    lat: z.number().optional(),
    lng: z.number().optional(),
});

export const Route = createFileRoute("/")({
    component: TransitApp,
    validateSearch: SearchSchema,
});

function TransitApp() {
    const { lat, lng } = Route.useSearch();
    const router = useRouter();

    const fixedUserLocation =
        lat !== undefined && lng !== undefined ? new LngLat(lng, lat) : undefined;

    const [nearbyTripsQueryParams, setNearbyTripsQueryParams] = useState({
        lat: lat ?? 0,
        lng: lng ?? 0,
        bbox: {
            minLat: (lat ?? 0) - 0.01,
            maxLat: (lat ?? 0) + 0.01,
            minLng: (lng ?? 0) - 0.01,
            maxLng: (lng ?? 0) + 0.01,
        },
    });
    const throttledNearbyTripsQueryParams = useThrottle(nearbyTripsQueryParams, 1000);

    const {
        data: nearbyTrips,
        refetch: refetchNearbyTrips,
        isFetching: isFetchingNearbyTrips,
    } = useQuery({
        ...trpc.tripInstance.getNearby.queryOptions(throttledNearbyTripsQueryParams),
        staleTime: 0,
        gcTime: 0,
        placeholderData: (prev) => prev, // prevent flickering
    });
    const nearbyTripsRefetchIntervalId = useRef<ReturnType<typeof setInterval> | null>(null);

    const closestStopName = useMemo(
        () =>
            nearbyTrips &&
            Object.values(nearbyTrips)
                .flatMap((directionRec) => Object.values(directionRec))
                .flat()
                .reduce<[number, string]>(
                    ([distance, stopName], cur) => {
                        const curDistance = cur.stop_time.distance;
                        return curDistance < distance
                            ? [curDistance, cur.stop_time.stop_name]
                            : [distance, stopName];
                    },
                    [Infinity, ""]
                )?.[1],
        [nearbyTrips]
    );

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

    const handleLocationChange: NonNullable<ExploreMapProps["onLocationChange"]> = useCallback(
        (lat, lng, viewBounds) => {
            if (fixedUserLocation) return;
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
        [setNearbyTripsQueryParams, fixedUserLocation]
    );

    const handleReturnToPrevPage = useCallback(() => {
        router.history.back();
    }, [router]);

    return (
        <div className="h-dvh w-dvw relative overflow-clip">
            <div className="w-full md:w-[calc(100%+var(--container-sm))] h-[calc(100%+50dvh)] md:h-full absolute bottom-0 left-0">
                <ExploreMap
                    onLocationChange={handleLocationChange}
                    fixedUserLocation={fixedUserLocation}
                />
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

            <div className="absolute bottom-4 md:top-4 left-4 h-min max-h-[50dvh] md:max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] md:w-sm flex flex-col gap-1">
                <div className="flex items-center gap-2">
                    {fixedUserLocation && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="p-2 rounded-full bg-primary-foreground/60 backdrop-blur-md"
                            onClick={handleReturnToPrevPage}
                        >
                            <X />
                        </Button>
                    )}
                    <div className="px-4 py-2 rounded-full bg-primary-foreground/60 backdrop-blur-md text-secondary-foreground font-medium text-sm w-full flex justify-between items-center gap-2">
                        <MapPin size={16} />
                        <span className="truncate text-center">
                            Near{" "}
                            {closestStopName ||
                                nearbyTripsQueryParams.lat?.toFixed(4) +
                                    ", " +
                                    nearbyTripsQueryParams.lng?.toFixed(4)}
                        </span>
                        <Loader2
                            size={16}
                            className={cn(
                                "animate-spin",
                                isFetchingNearbyTrips ? "visible" : "invisible"
                            )}
                        />
                    </div>
                </div>
                <div className="p-2 overflow-auto rounded-md bg-primary-foreground/60 backdrop-blur-md">
                    <DepartureBoard departures={nearbyTrips || null} />
                </div>
            </div>
        </div>
    );
}
