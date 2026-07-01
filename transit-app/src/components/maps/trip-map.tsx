import { ProtoMap } from "@/components/maps/proto-map";
import { DEFAULT_LOCATION } from "@/constants/location";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePersistUserSetLocation } from "@/hooks/use-persist-user-set-location";
import type { Direction } from "database/models/enums";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { type MapRef, type ViewStateChangeEvent } from "react-map-gl/maplibre";
import AppMapSideControls from "./controls/app-map-side-controls";
import { ShapeLayer } from "./layers/shape-layer";
import { StopsLayer } from "./layers/stops-layer";
import { VehiclesLayer } from "./layers/vehicles-layer";
import type { TripMapStopInfo } from "./types";
import { UserLocationMarker } from "./user-location";

export type TripMapProps = {
    tripData?: {
        routeId: number;
        direction?: Direction;
        shapeId: number | null;
        stopInfos: TripMapStopInfo[];
    };
    routeColor?: string;
    routeTextColor?: string;
};

export const TripMap: React.FC<TripMapProps> = ({ tripData, routeColor, routeTextColor }) => {
    const targetStop = tripData?.stopInfos.find((stop) => stop.isTarget);

    const mapRef = useRef<MapRef>(null);
    const isMobile = useIsMobile();
    const [viewState, setViewState] = useState({
        longitude: DEFAULT_LOCATION.lng,
        latitude: DEFAULT_LOCATION.lat,
        zoom: 15,
    });

    const [userSetLocation] = usePersistUserSetLocation();

    useEffect(() => {
        setViewState((prev) => ({
            ...prev,
            longitude: userSetLocation.lng,
            latitude: userSetLocation.lat,
        }));
    }, [userSetLocation, setViewState]);

    // Fit the map to include both the target stop and the user set location.
    const handleLoad = () => {
        const map = mapRef.current?.getMap();
        map?.resize();

        const camera =
            targetStop?.lng && targetStop?.lat
                ? map?.cameraForBounds(
                      [
                          [
                              Math.min(targetStop.lng, userSetLocation.lng),
                              Math.min(targetStop.lat, userSetLocation.lat),
                          ],
                          [
                              Math.max(targetStop.lng, userSetLocation.lng),
                              Math.max(targetStop.lat, userSetLocation.lat),
                          ],
                      ],
                      {
                          padding: 80,
                          maxZoom: 16,
                          offset: [isMobile ? 0 : window.innerWidth / 4, -100],
                      },
                  )
                : null;

        if (camera)
            map?.flyTo({
                ...camera,
                animate: true,
                duration: 1000,
            });
    };

    const handleMove = useCallback(
        (evt: ViewStateChangeEvent) => {
            setViewState(evt.viewState);
        },
        [setViewState],
    );

    return (
        <ProtoMap {...viewState} ref={mapRef} onMove={handleMove} onLoad={handleLoad}>
            <AppMapSideControls />

            {tripData && (
                <>
                    {tripData.shapeId && (
                        <ShapeLayer
                            shapeId={tripData.shapeId}
                            shapeColor={routeColor}
                            targetStopShapeDistTraveled={targetStop?.shapeDistTraveled ?? 0}
                        />
                    )}
                    <StopsLayer
                        stopInfos={tripData.stopInfos}
                        routeId={tripData.routeId}
                        direction={tripData.direction}
                        stopColor={routeTextColor}
                        stopBorderColor={routeColor}
                    />
                    <VehiclesLayer
                        routeId={tripData.routeId}
                        direction={tripData.direction}
                        routeColor={routeColor || "var(--primary)"}
                        routeTextColor={routeTextColor || "var(--primary-foreground)"}
                        targetStopSequence={targetStop?.sequence}
                    />
                </>
            )}

            <UserLocationMarker />
        </ProtoMap>
    );
};
