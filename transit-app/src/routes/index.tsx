import { AppSettings } from "@/components/app-settings";
import { useGeolocation } from "@/components/geolocation-provider";
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
import { cn } from "@/lib/utils";
import { trpc } from "@/main";
import { haversine } from "@/utils/geo";
import { showGeolocationDeniedToast, showGeolocationToast } from "@/components/geolocation-toast";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useDebounce, useThrottle } from "ahooks";
import { Loader2, MapPin, SettingsIcon, X } from "lucide-react";
import { LngLat } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import z from "zod";

const SearchSchema = z.object({
    lat: z.number().optional(),
    lng: z.number().optional(),
});

export const Route = createFileRoute("/")({
    component: TransitApp,
    validateSearch: SearchSchema,
});

const MIN_RADIUS_METERS = 300;
const MAX_RADIUS_METERS = 3000;

function TransitApp() {
    const search = Route.useSearch();
    const router = useRouter();

    const fixedUserLocation =
        search.lat !== undefined && search.lng !== undefined
            ? new LngLat(search.lng, search.lat)
            : undefined;
    const geolocation = useGeolocation();
    const [nearbyTripsQueryParams, setNearbyTripsQueryParams] = useState({
        lat: search.lat ?? 0,
        lng: search.lng ?? 0,
        radiusMeters: 100,
    });
    const debouncedNearbyTripsQueryParams = useDebounce(nearbyTripsQueryParams, {
        wait: 800,
        maxWait: 6000,
    });

    const { data: nearbyTrips, isFetching: isFetchingNearbyTrips } = useQuery({
        ...trpc.tripInstance.getNearbyActive.queryOptions(debouncedNearbyTripsQueryParams),
        staleTime: 0,
        gcTime: 0,
        placeholderData: (prev) => prev, // prevent flickering,
        refetchInterval: 60_000,
    });

    const closestStopName = useMemo(
        () =>
            nearbyTrips &&
            nearbyTrips.reduce(
                (prev, curr) => (prev && prev.distanceMeters < curr.distanceMeters ? prev : curr),
                nearbyTrips.at(0),
            )?.stopName,
        [nearbyTrips],
    );

    const handleLocationChange: NonNullable<ExploreMapProps["onLocationChange"]> = useCallback(
        (lat, lng, viewBounds) => {
            if (fixedUserLocation) return;
            const diagonalDistanceKm = haversine(
                viewBounds.getNorthEast(),
                viewBounds.getSouthWest(),
            );
            const radiusMeters = (diagonalDistanceKm * 1000) / 2;
            const clampedRadiusMeters = Math.min(
                Math.max(radiusMeters, MIN_RADIUS_METERS),
                MAX_RADIUS_METERS,
            );

            setNearbyTripsQueryParams((prev) => ({
                ...prev,
                lat,
                lng,
                radiusMeters: clampedRadiusMeters,
            }));
        },
        [setNearbyTripsQueryParams, fixedUserLocation],
    );

    const handleReturnToPrevPage = useCallback(() => {
        router.history.back();
    }, [router]);

    const geolocationToastId = useRef<string | number | null>(null);

    useEffect(() => {
        console.log("geolocation.status", geolocation.status);
        if (geolocation.status === "idle") {
            if (geolocationToastId.current) return;
            geolocationToastId.current = showGeolocationToast(geolocation.requestPermission);
        } else if (geolocation.status === "denied") {
            geolocationToastId.current = showGeolocationDeniedToast();
        } else if (geolocation.status === "watching") {
            if (geolocationToastId.current) {
                toast.dismiss(geolocationToastId.current);
                geolocationToastId.current = null;
            }
        }
    }, [geolocation.status, geolocation.requestPermission]);

    return (
        <div className="h-dvh w-dvw relative overflow-clip">
            <div className="w-full md:w-[calc(100%+var(--container-sm))] h-[calc(100%+50dvh)] md:h-full absolute bottom-0 left-0">
                <ExploreMap
                    onLocationChange={handleLocationChange}
                    fixedUserLocation={fixedUserLocation}
                />
            </div>

            {/* <GeolocationBanner
                className="absolute top-4 ml-100 w-sm"
                status={geolocation.status}
                error={geolocation.error}
                onRequestPermission={geolocation.requestPermission}
            /> */}

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
                                isFetchingNearbyTrips ? "visible" : "invisible",
                            )}
                        />
                    </div>
                </div>
                <div className="p-2 overflow-auto rounded-xl bg-primary-foreground/60 backdrop-blur-md">
                    <DepartureBoard departures={nearbyTrips || []} />
                </div>
            </div>
        </div>
    );
}
