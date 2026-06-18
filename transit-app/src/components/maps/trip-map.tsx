import { ProtoMap } from "@/components/maps/proto-map";
import { DEFAULT_LOCATION } from "@/constants/location";
import { usePersistUserSetLocation } from "@/hooks/use-persist-user-set-location";
import type { Direction } from "database/models/enums";
import React, { useCallback, useEffect, useState } from "react";
import { type ViewStateChangeEvent } from "react-map-gl/maplibre";
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

    const [viewState, setViewState] = useState({
        longitude: DEFAULT_LOCATION.lng,
        latitude: DEFAULT_LOCATION.lat,
        zoom: 16.5,
    });

    const [userSetLocation] = usePersistUserSetLocation();

    // Set the map center to the mid point between the stop and the user set location.
    // If there is no stop location, use the user set location.
    useEffect(() => {
        const roughMidLng = targetStop?.lng
            ? (targetStop.lng + userSetLocation.lng) / 2
            : userSetLocation.lng;
        const roughMidLat = targetStop?.lat
            ? (targetStop.lat + userSetLocation.lat) / 2
            : userSetLocation.lat;

        setViewState((prev) => ({
            ...prev,
            longitude: roughMidLng,
            latitude: roughMidLat,
        }));
    }, [targetStop, userSetLocation, setViewState]);

    const handleMove = useCallback(
        (evt: ViewStateChangeEvent) => {
            setViewState(evt.viewState);
        },
        [setViewState],
    );

    return (
        <ProtoMap {...viewState} onMove={handleMove}>
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
