import { EMPTY_FEATURE_COLLECTION } from "@/constants/geojson";
import { useThemeColors } from "@/hooks/use-theme-colors";
import { getMutedColor } from "@/utils/css";
import { Link } from "@tanstack/react-router";
import type { Direction } from "database/models/enums";
import { format as formatDate, isFuture, type DateArg } from "date-fns";
import type { FeatureCollection } from "geojson";
import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import {
    Layer,
    Marker,
    Source,
    useMap,
    type LayerProps,
    type MapLayerMouseEvent,
} from "react-map-gl/maplibre";
import { AlertCarousel } from "../../trip-info/alert-carousel";
import { Button } from "../../ui/button";
import {
    ResponsiveModal,
    ResponsiveModalContent,
    ResponsiveModalDescription,
    ResponsiveModalHeader,
    ResponsiveModalTitle,
    ResponsiveModalTrigger,
} from "../../ui/responsible-dialog";
import type { TripMapStopInfo } from "../types";

export type StopsLayerProps = {
    stopInfos: TripMapStopInfo[];
    stopBorderColor?: string;
    stopColor?: string;
    routeId: number;
    direction?: Direction;
};

export const StopsLayer: React.FC<StopsLayerProps> = (props) => {
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
