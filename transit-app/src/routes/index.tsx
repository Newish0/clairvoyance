import { useGeolocation } from "@/components/geolocation-provider";
import { ExploreMap, type ExploreMapProps } from "@/components/maps/explore-map";
import PrimaryPanel from "@/components/primary-panel";
import { DepartureBoard } from "@/components/trip-info/departure/departure-board";
import { Button } from "@/components/ui/button";
import { useGeolocationToast } from "@/hooks/use-geolocation-toast";
import { cn } from "@/lib/utils";
import { trpcOptions } from "@/main";
import { haversine } from "@/utils/geo";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useDebounce } from "ahooks";
import { useMovementThreshold } from "@/hooks/use-movement-threshold";
import { Loader2, MapPin, X } from "lucide-react";
import { LngLat } from "maplibre-gl";
import { useCallback, useMemo, useRef, useState } from "react";
import z from "zod";

const SearchSchema = z.object({
    lat: z.number().optional(),
    lng: z.number().optional(),
});

export const Route = createFileRoute("/")({
    component: TransitApp,
    validateSearch: SearchSchema,
});

const MIN_RADIUS_METERS = 750;
const MAX_RADIUS_METERS = 2400;

function TransitApp() {
    const search = Route.useSearch();
    const router = useRouter();

    const [isScrolled, setIsScrolled] = useState(false);

    const geolocation = useGeolocation();
    useGeolocationToast(geolocation);

    const [movementThresholdMeters] = useMovementThreshold();
    const lastPositionRef = useRef<{ lat: number; lng: number } | null>(null);

    const fixedUserLocation =
        search.lat !== undefined && search.lng !== undefined
            ? new LngLat(search.lng, search.lat)
            : undefined;
    const [nearbyTripsQueryParams, setNearbyTripsQueryParams] = useState({
        lat: search.lat ?? 0,
        lng: search.lng ?? 0,
        radiusMeters: MIN_RADIUS_METERS,
    });
    const debouncedNearbyTripsQueryParams = useDebounce(nearbyTripsQueryParams, {
        wait: 800,
        maxWait: 6000,
    });

    const { data: nearbyTrips, isFetching: isFetchingNearbyTrips } = useQuery({
        ...trpcOptions.tripInstance.getNearbyActive.queryOptions(debouncedNearbyTripsQueryParams),
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
            // Noise gate - skip refetch if movement below threshold (GPS drift / micro-pan)
            if (lastPositionRef.current) {
                const distanceKm = haversine(lastPositionRef.current, { lat, lng });
                if (distanceKm * 1000 < movementThresholdMeters) return;
            }
            lastPositionRef.current = { lat, lng };
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
        [setNearbyTripsQueryParams, fixedUserLocation, movementThresholdMeters],
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

            <PrimaryPanel
                className="pt-4 pb-[14dvh] md:pb-4"
                snapPoints={["136px", 0.5, 0.88]}
                noMarginSnapPoints={[]}
            >
                <div className="flex items-center gap-2 px-4">
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
                </div>

                <div
                    className={cn("overflow-auto px-4 space-y-4")}
                    data-vaul-no-drag={isScrolled || undefined}
                    onScroll={(e) => setIsScrolled(e.currentTarget.scrollTop > 10)}
                >
                    <DepartureBoard departures={nearbyTrips || []} />
                </div>
            </PrimaryPanel>
        </div>
    );
}
