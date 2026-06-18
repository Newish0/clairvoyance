import { ProtoMap } from "@/components/maps/proto-map";
import { EMPTY_FEATURE_COLLECTION } from "@/constants/geojson";
import { DEFAULT_LOCATION } from "@/constants/location";
import { usePersistUserSetLocation } from "@/hooks/use-persist-user-set-location";
import { useThemeColors } from "@/hooks/use-theme-colors";
import { trpc } from "@/main";
import { getMutedColor, withOpacity } from "@/utils/css";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useSubscription } from "@trpc/tanstack-react-query";
import type { Direction } from "database/models/enums";
import { format as formatDate, isFuture, type DateArg } from "date-fns";
import type { FeatureCollection } from "geojson";
import { ChevronRight } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import {
    Layer,
    Marker,
    Source,
    useMap,
    type LayerProps,
    type MapLayerMouseEvent,
    type ViewStateChangeEvent,
} from "react-map-gl/maplibre";
import type { VehiclePosition } from "../trip-info/vehicle-position-details";
import { UserLocationMarker } from "./user-location";
import { VehiclePositionMapMarker } from "./vehicle-map-marker";
import type { inferProcedureOutput } from "@trpc/server";
import type { AppRouter } from "transit-api";
import {
    ResponsiveModal,
    ResponsiveModalContent,
    ResponsiveModalDescription,
    ResponsiveModalHeader,
    ResponsiveModalTitle,
    ResponsiveModalTrigger,
} from "../ui/responsible-dialog";
import { getStopAlertEffect } from "@/utils/alert";
import type { alerts } from "database";
import { AlertCarousel } from "../trip-info/alert-carousel";
import { Button } from "../ui/button";
import AppMapSideControls from "./controls/app-map-side-controls";

export type TripMapStopInfo = {
    stopId: number;
    sequence: number;
    effectiveTime: Date | null;
    name: string;
    lng: number;
    lat: number;
    shapeDistTraveled: number | null;
    isTarget?: boolean;
    alerts?: inferProcedureOutput<AppRouter["alert"]["getAlertForTripInstance"]>;
};

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
                <ShapesGeojsonLayer
                    shapeId={props.shapeId}
                    shapeColor={props.routeColor}
                    targetStopShapeDistTraveled={targetStop?.shapeDistTraveled ?? 0}
                />
            )}
            <StopsGeojsonLayer
                stopInfos={props.stopInfos}
                routeId={props.routeId}
                direction={props.direction}
                stopColor={props.routeTextColor}
                stopBorderColor={props.routeColor}
            />
            <LiveVehiclesLayer
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

const StopsGeojsonLayer: React.FC<{
    stopInfos: TripMapStopInfo[];
    stopBorderColor?: string;
    stopColor?: string;
    routeId: number;
    direction?: Direction;
}> = (props) => {
    const targetStopIdx = props.stopInfos.findIndex((stop) => stop.isTarget);

    const colors = useThemeColors();
    const { current: map } = useMap();

    const [focusedStopInfo, setFocusedStopInfo] = useState<{
        lng: number;
        lat: number;
        stopId: number;
        name?: string;
        effectiveTime: DateArg<Date> | null;
        alerts?: TripMapStopInfo["alerts"];
    } | null>(null);

    const indexedStopsGeojson: FeatureCollection = props.stopInfos.length
        ? {
              type: "FeatureCollection",
              features: props.stopInfos.map((stop, index) => ({
                  type: "Feature",
                  geometry: {
                      type: "Point",
                      coordinates: [stop.lng, stop.lat],
                  },
                  properties: {
                      index,
                      hasAlert: stop.alerts && stop.alerts.length > 0,
                  },
              })),
          }
        : EMPTY_FEATURE_COLLECTION;

    const borderColor = props.stopBorderColor || colors.background;
    const stopColor = props.stopColor || colors.foreground;
    const mutedBorderColor = getMutedColor(borderColor);
    const mutedStopColor = getMutedColor(stopColor);

    const stopBorderLayerId = "stops-border-layer";
    const stopFillLayerId = "stops-fill-layer";
    const stopAlertCircleLayerStyle: LayerProps = {
        id: stopBorderLayerId,
        type: "circle",
        paint: {
            "circle-radius": ["case", ["==", ["get", "hasAlert"], true], 24, 0],
            "circle-color": "#f003",
            "circle-stroke-color": "#f005",
            "circle-stroke-width": 2,
        },
    };

    const stopCircleLayerStyle: LayerProps = {
        id: stopFillLayerId,
        type: "circle",
        paint: {
            "circle-radius": ["case", ["==", ["get", "index"], targetStopIdx], 8, 6],
            "circle-color": [
                "case",
                ["<", ["get", "index"], targetStopIdx],
                mutedStopColor,
                stopColor,
            ],
            "circle-stroke-color": [
                "case",
                ["<", ["get", "index"], targetStopIdx],
                mutedBorderColor,
                borderColor,
            ],
            "circle-stroke-width": ["case", ["==", ["get", "index"], targetStopIdx], 6, 2],
        },
    };

    // Add on geojson click handler
    useEffect(() => {
        if (!map) return;

        const flightDuration = 1000;
        let isFlying = false;
        const handleClick = (e: MapLayerMouseEvent) => {
            const index = e.features?.[0]?.properties?.index;
            if (index === undefined) return;

            const stopInfo = props.stopInfos[index];
            if (!stopInfo) return;

            isFlying = true;
            map.flyTo({
                center: [stopInfo.lng, stopInfo.lat],
                offset: [0, -100],
                animate: true,
                duration: flightDuration,
            });
            setTimeout(() => {
                isFlying = false;
            }, flightDuration + 100);
            setFocusedStopInfo({
                ...stopInfo,
            });
        };

        const handleMove = () => {
            if (isFlying) return;
            setFocusedStopInfo(null);
        };

        map.on("click", [stopFillLayerId, stopBorderLayerId], handleClick);
        map.on("move", handleMove);

        // Change cursor on hover
        map.on("mouseenter", [stopFillLayerId, stopBorderLayerId], () => {
            map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", [stopFillLayerId, stopBorderLayerId], () => {
            map.getCanvas().style.cursor = "";
        });

        // cleanup
        return () => {
            map.off("click", [stopFillLayerId, stopBorderLayerId], handleClick);
            map.off("move", handleMove);
        };
    }, [map, setFocusedStopInfo, props.stopInfos]);

    return (
        <>
            <Source type="geojson" data={indexedStopsGeojson}>
                <Layer {...stopAlertCircleLayerStyle} />
                <Layer {...stopCircleLayerStyle} />
            </Source>
            {focusedStopInfo && (
                <Marker
                    longitude={focusedStopInfo.lng}
                    latitude={focusedStopInfo.lat}
                    anchor="right"
                >
                    <div className="min-h-4 bg-primary-foreground/70 backdrop-blur-md p-3 rounded-lg mr-4 flex gap-2 items-center">
                        <div>
                            <div className="text-xs  leading-none">{focusedStopInfo.name}</div>

                            {focusedStopInfo.effectiveTime && (
                                <div className="text-xs text-muted-foreground">
                                    {isFuture(focusedStopInfo.effectiveTime)
                                        ? "Arriving"
                                        : "Arrived"}
                                    {" at "}
                                    {formatDate(focusedStopInfo.effectiveTime, "p")}
                                </div>
                            )}

                            {focusedStopInfo.alerts?.length ? (
                                <ResponsiveModal>
                                    <ResponsiveModalTrigger asChild>
                                        <Button variant="link" className="text-xs p-0 h-min">
                                            View {focusedStopInfo.alerts.length} Alerts
                                        </Button>
                                    </ResponsiveModalTrigger>
                                    <ResponsiveModalContent className="min-w-1/2 max-w-3xl bg-primary-foreground/60 backdrop-blur-md">
                                        <ResponsiveModalHeader>
                                            <ResponsiveModalTitle>Stop Alerts</ResponsiveModalTitle>
                                            <ResponsiveModalDescription>
                                                {focusedStopInfo.name}
                                            </ResponsiveModalDescription>
                                        </ResponsiveModalHeader>
                                        <AlertCarousel
                                            alerts={focusedStopInfo.alerts}
                                            orientation="vertical"
                                            className="mx-2 mb-2 md:m-0"
                                        />
                                    </ResponsiveModalContent>
                                </ResponsiveModal>
                            ) : null}
                        </div>
                        <Link
                            to={`/`}
                            search={{ lat: focusedStopInfo.lat, lng: focusedStopInfo.lng }}
                        >
                            <div>
                                <ChevronRight size={16} />
                            </div>
                        </Link>
                    </div>
                </Marker>
            )}
        </>
    );
};

const ShapesGeojsonLayer: React.FC<{
    shapeId: number;
    targetStopShapeDistTraveled: number;
    shapeColor?: string;
}> = (props) => {
    const { data: shapeGeojson } = useQuery({
        ...trpc.shape.getGeoJsonById.queryOptions(props.shapeId),
        initialData: null,
    });

    const colors = useThemeColors();
    const shapeColor = props.shapeColor || colors.foreground;
    const mutedShapeColor = withOpacity(getMutedColor(shapeColor), 0.9);

    const targetShapeIndex =
        shapeGeojson?.properties.distancesTraveled?.findIndex(
            (dist) => dist >= props.targetStopShapeDistTraveled,
        ) ?? 0;

    const beforeAtShapeGeojson = shapeGeojson
        ? {
              ...shapeGeojson,
              properties: {
                  ...shapeGeojson.properties,
                  distancesTraveled: shapeGeojson.properties.distancesTraveled?.slice(
                      0,
                      targetShapeIndex + 1,
                  ),
              },
              geometry: {
                  ...shapeGeojson.geometry,
                  coordinates: shapeGeojson.geometry.coordinates.slice(0, targetShapeIndex + 1),
              },
          }
        : EMPTY_FEATURE_COLLECTION;

    const atAndAfterShapeGeojson = shapeGeojson
        ? {
              ...shapeGeojson,
              properties: {
                  ...shapeGeojson.properties,
                  distancesTraveled:
                      shapeGeojson.properties.distancesTraveled?.slice(targetShapeIndex),
              },
              geometry: {
                  ...shapeGeojson.geometry,
                  coordinates: shapeGeojson.geometry.coordinates.slice(targetShapeIndex),
              },
          }
        : EMPTY_FEATURE_COLLECTION;

    const beforeShapeLayerStyle: LayerProps = {
        type: "line",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": mutedShapeColor, "line-width": 6 },
    };

    const atAndAfterShapeLayerStyle: LayerProps = {
        type: "line",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": shapeColor, "line-width": 10 },
    };

    return (
        <>
            <Source type="geojson" data={beforeAtShapeGeojson}>
                <Layer {...beforeShapeLayerStyle} />
            </Source>
            <Source type="geojson" data={atAndAfterShapeGeojson}>
                <Layer {...atAndAfterShapeLayerStyle} />
            </Source>
        </>
    );
};

const LiveVehiclesLayer: React.FC<{
    routeId: number;
    routeColor?: string;
    routeTextColor?: string;
    direction?: Direction;
    targetStopSequence?: number;
}> = ({ routeId, direction, routeColor, routeTextColor, targetStopSequence }) => {
    const [positions, setPositions] = useState<VehiclePosition[]>([]);
    const subscription = useSubscription(
        trpc.tripInstance.livePositions.subscriptionOptions(
            {
                routeId,
                direction,
            },
            {
                onData: (data) => {
                    setPositions(data);
                },
                onError: (error) => {
                    console.error("onError", error);
                },
                onStarted: () => {
                    console.log("onStarted");
                },
                onConnectionStateChange: (state) => {
                    console.log("onConnectionStateChange", state);
                },
            },
        ),
    );

    // console.log("positions", positions);

    return (
        <>
            {Object.entries(positions).map(
                ([tripInstanceId, position]) =>
                    position && (
                        <LiveVehicleMarker
                            key={tripInstanceId}
                            routeColor={routeColor}
                            routeTextColor={routeTextColor}
                            position={position}
                            targetStopSequence={targetStopSequence}
                        />
                    ),
            )}
        </>
    );
};

const LiveVehicleMarker: React.FC<{
    routeColor?: string;
    routeTextColor?: string;
    position: VehiclePosition;
    targetStopSequence?: number;
}> = ({ position, routeColor, routeTextColor, targetStopSequence }) => {
    const {
        location: { x: longitude, y: latitude },
    } = position;

    if (!latitude || !longitude) {
        return null;
    }

    return (
        <VehiclePositionMapMarker
            vehiclePosition={position}
            longitude={longitude}
            latitude={latitude}
            routeColor={routeColor}
            routeTextColor={routeTextColor}
            targetStopSequence={targetStopSequence}
        />
    );
};
