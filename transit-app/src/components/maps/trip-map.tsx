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
    routeId: number;
    direction?: Direction;
    routeColor?: string;
    routeTextColor?: string;
    stopInfos: TripMapStopInfo[];
    shapeId: number | null;
};

export const TripMap: React.FC<TripMapProps> = (props) => {
    const targetStop = props.stopInfos.find((stop) => stop.isTarget);

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

            {props.shapeId && (
                <ShapeLayer
                    shapeId={props.shapeId}
                    shapeColor={props.routeColor}
                    targetStopShapeDistTraveled={targetStop?.shapeDistTraveled ?? 0}
                />
            )}
            <StopsLayer
                stopInfos={props.stopInfos}
                routeId={props.routeId}
                direction={props.direction}
                stopColor={props.routeTextColor}
                stopBorderColor={props.routeColor}
            />
            <VehiclesLayer
                routeId={props.routeId}
                direction={props.direction}
                routeColor={props.routeColor || "var(--primary)"}
                routeTextColor={props.routeTextColor || "var(--primary-foreground)"}
                targetStopSequence={targetStop?.sequence}
            />

            <UserLocationMarker />
        </ProtoMap>
    );
};
