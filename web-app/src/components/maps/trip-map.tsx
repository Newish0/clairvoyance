import { differenceInSeconds } from "date-fns";
import type { Feature, FeatureCollection, Point } from "geojson";
import {
    DirectionId,
    OccupancyStatus,
    StopTimeUpdateScheduleRelationship,
    type ScheduledTripDocument,
} from "gtfs-db-types";
import { BusFrontIcon } from "lucide-solid";
import {
    createEffect,
    createMemo,
    createResource,
    createSignal,
    on,
    onCleanup,
    onMount,
    Show,
    type Accessor,
    type Component,
    type Signal,
} from "solid-js";
import { render } from "solid-js/web";
import { ProgressCircle } from "~/components/ui/progress-circle";
import { useMapLocation } from "~/hooks/use-map-location";
import { useMapStyle } from "~/hooks/use-map-style";
import { useRouteLiveVehicles } from "~/hooks/use-route-live-vehicles";
import { useTheme } from "~/hooks/use-theme";
import { cn } from "~/lib/utils";
import { getShapeAsGeoJson } from "~/services/shapes";
import { getStopsGeoJson } from "~/services/stops";
import { getScheduledTripDetails } from "~/services/trips";
import { Badge } from "../ui/badge";
import {
    ResponsiveDialog,
    ResponsiveDialogContent,
    ResponsiveDialogTrigger,
} from "../ui/responsive-dialog";
import TripVehicleInfo from "../ui/trip-vehicle-info";
import { asHtmlElement, LocationMarker } from "./location-marker";

import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type TripMapProps = {
    tripObjectId: string;
    stopId: string;
};

const emptyGeoJson: FeatureCollection = { type: "FeatureCollection", features: [] };

const TripMap: Component<TripMapProps> = (props) => {
    let container: HTMLDivElement;
    const [map, setMap] = createSignal<maplibregl.Map | null>(null);
    const mapStyle = useMapStyle();
    const [, , isDark] = useTheme();

    const [tripDetails] = createResource(() => getScheduledTripDetails(props.tripObjectId));

    const [rawShapeLineGeoJson] = createResource(
        () => ({ shapeId: tripDetails()?.shape_id }),
        ({ shapeId }) => getShapeAsGeoJson(shapeId)
    );
    const [rawStopsGeoJson] = createResource(
        () => ({
            stopIds: tripDetails()?.stop_times.map((st) => st.stop_id),
        }),
        ({ stopIds }) => stopIds && getStopsGeoJson(stopIds)
    );

    const { vehicles: vehiclesMap } = useRouteLiveVehicles({
        routeId: () => tripDetails()?.route_id,
        directionId: () => tripDetails()?.direction_id as DirectionId,
    });
    const vehicles = () => vehiclesMap().values().toArray();

    // Group stops geojson into before, at, and after our stop
    const groupedStopsGeoJson = createMemo(() => {
        const stopsGeoJson = rawStopsGeoJson();
        const details = tripDetails();
        if (!stopsGeoJson || !details) return null;

        const features = stopsGeoJson.features as Feature<Point, { stopId: string }>[];

        const stopTimes = details.stop_times;
        const sortedFeatures = features.toSorted(
            (a, b) =>
                stopTimes.find((st) => st.stop_id === a.properties.stopId)!.stop_sequence -
                stopTimes.find((st) => st.stop_id === b.properties.stopId)!.stop_sequence
        );
        const ourStopIndex: number = sortedFeatures.findIndex(
            (f) => f.properties.stopId === props.stopId
        );

        if (ourStopIndex === -1) return null;

        return {
            before: {
                type: "FeatureCollection",
                features: sortedFeatures.slice(0, ourStopIndex),
            },
            after: {
                type: "FeatureCollection",
                // FIX: Use slice(ourStopIndex) to match original component's behavior
                // (includes the current stop in the "after" collection).
                features: sortedFeatures.slice(ourStopIndex),
            },
            at: {
                type: "FeatureCollection",
                features: [sortedFeatures[ourStopIndex]],
                index: ourStopIndex,
            },
        } as const;
    });

    // Create geojson for stops we're skipping (likely with associated alerts)
    const skippedStopsGeoJson = createMemo(() => {
        const stopsGeoJson = rawStopsGeoJson();
        const details = tripDetails();
        if (!stopsGeoJson || !details) return null;

        const features = stopsGeoJson.features as Feature<Point, { stopId: string }>[];

        const stopTimes = details.stop_times;
        const skippedStops = stopTimes.filter(
            (st) => st.schedule_relationship === StopTimeUpdateScheduleRelationship.SKIPPED
        );

        const affectedFeatures = features.filter((f) =>
            skippedStops.some((st) => st.stop_id === f.properties.stopId)
        );

        return {
            type: "FeatureCollection",
            features: affectedFeatures,
        } as const;
    });

    // Group shape line geojson into those before and after our stop
    const groupedShapeLineGeoJson = createMemo(() => {
        if (!rawShapeLineGeoJson() || !tripDetails()) return null;
        const ourStopTime = tripDetails()!.stop_times.find((st) => st.stop_id === props.stopId);
        if (!ourStopTime?.shape_dist_traveled) return null;
        const ourStopDistTraveled = ourStopTime.shape_dist_traveled;
        const coordinates = rawShapeLineGeoJson()!.geometry.coordinates;
        const distancesTraveled = rawShapeLineGeoJson()!.properties.distances_traveled;
        const nearestShapeIndex = distancesTraveled?.findIndex(
            (dist) => dist >= ourStopDistTraveled
        );
        if (nearestShapeIndex === undefined || nearestShapeIndex === -1) return null;
        return {
            before: {
                type: "LineString",
                coordinates: coordinates.slice(0, nearestShapeIndex + 1),
            },
            after: { type: "LineString", coordinates: coordinates.slice(nearestShapeIndex) },
        } as const;
    });

    const mapLocation = useMapLocation({ thresholdDistance: 100, enableHighAccuracy: true });

    const markers = {
        currentLocation: new maplibregl.Marker({
            element: asHtmlElement(<LocationMarker type="blue" />),
        }).setLngLat([0, 0]),
        selectedLocation: new maplibregl.Marker({
            element: asHtmlElement(<LocationMarker type="purple" />),
        }).setLngLat([0, 0]),
    } as const;

    createEffect(
        on(
            mapLocation.selectedLocation,
            (selectedLocation) => {
                if (selectedLocation) {
                    const currentCenter = map()?.getCenter();
                    if (
                        currentCenter?.lng !== selectedLocation.lng ||
                        currentCenter?.lat !== selectedLocation.lat
                    ) {
                        map()?.setCenter([selectedLocation.lng, selectedLocation.lat]);
                    }
                }
            },
            { defer: true }
        )
    );

    const routeColor = createMemo(() => {
        const color = {
            light: {
                before: { border: "#eeee", fill: "#999c" },
                after: { border: "#fffe", fill: "#333e" },
                skippedStopFill: "#d339",
            },
            dark: {
                before: { border: "#999c", fill: "#333b" },
                after: { border: "#666e", fill: "#fffd" },
                skippedStopFill: "#d339",
            },
        };
        return isDark() ? color.dark : color.light;
    });

    // Init map
    onMount(() => {
        const m = new maplibregl.Map({
            container,
            style: mapStyle(),
            center: mapLocation.selectedLocation(),
            zoom: 12,
        });

        m.once("load", () => setMap(m));
        onCleanup(() => m.remove());
    });

    // HACK: sync map style to map by reconstructing map (b/c setStyle removes our own geojson layers and sources)
    createEffect(
        on(mapStyle, (mapStyle) => {
            const mapInstance = map();
            if (!mapInstance) return;
            const newMap = new maplibregl.Map({
                container: mapInstance.getContainer(),
                style: mapStyle,
                center: mapInstance.getCenter(),
                zoom: mapInstance.getZoom(),
            });
            newMap.once("load", () => setMap(newMap));
            mapInstance.remove();
        })
    );

    // Init geojson sources and layers when map chances (e.g. map is loaded)
    createEffect(
        on(
            [map],
            ([map]) => {
                if (!map) return;
                map.addSource("shape-before", { type: "geojson", data: emptyGeoJson });
                map.addSource("shape-after", { type: "geojson", data: emptyGeoJson });
                map.addSource("stops-before", { type: "geojson", data: emptyGeoJson });
                map.addSource("stops-after", { type: "geojson", data: emptyGeoJson });
                map.addSource("skipped-stops", { type: "geojson", data: emptyGeoJson });
                const colors = routeColor();
                map.addLayer({
                    id: "shape-before",
                    type: "line",
                    source: "shape-before",
                    layout: { "line-join": "round", "line-cap": "round" },
                    paint: { "line-color": colors.before.fill, "line-width": 8 },
                });
                map.addLayer({
                    id: "shape-after",
                    type: "line",
                    source: "shape-after",
                    layout: { "line-join": "round", "line-cap": "round" },
                    paint: { "line-color": colors.after.fill, "line-width": 8 },
                });
                map.addLayer({
                    id: "skipped-stops",
                    type: "circle",
                    source: "skipped-stops",
                    paint: { "circle-color": colors.skippedStopFill, "circle-radius": 20 },
                });
                map.addLayer({
                    id: "stops-before-border",
                    type: "circle",
                    source: "stops-before",
                    paint: { "circle-color": colors.before.border, "circle-radius": 10 },
                });
                map.addLayer({
                    id: "stops-before-fill",
                    type: "circle",
                    source: "stops-before",
                    paint: { "circle-color": colors.before.fill, "circle-radius": 6 },
                });
                map.addLayer({
                    id: "stops-after-border",
                    type: "circle",
                    source: "stops-after",
                    paint: { "circle-color": colors.after.border, "circle-radius": 10 },
                });
                map.addLayer({
                    id: "stops-after-fill",
                    type: "circle",
                    source: "stops-after",
                    paint: { "circle-color": colors.after.fill, "circle-radius": 6 },
                });

                // const directions = new MapLibreGlDirections(map);
                // createEffect(
                //     on(
                //         [mapLocation.selectedLocation, () => groupedStopsGeoJson()?.at],
                //         ([loc, atStop]) => {
                //             if (loc && atStop?.features[0]) {
                //                 const stopCoords = atStop.features[0].geometry.coordinates;
                //                 directions.setWaypoints([
                //                     [loc.lng, loc.lat],
                //                     [stopCoords[0], stopCoords[1]],
                //                 ]);
                //             }
                //         }
                //     )
                // );
            },
            { defer: true }
        )
    );

    // geojson for shapes (i.e. route lines)
    createEffect(
        on([groupedShapeLineGeoJson, map], ([data, map]) => {
            if (map && data) {
                (map.getSource("shape-before") as maplibregl.GeoJSONSource).setData(data.before);
                (map.getSource("shape-after") as maplibregl.GeoJSONSource).setData(data.after);
            }
        })
    );

    // geojson for stops
    createEffect(
        on([groupedStopsGeoJson, map], ([data, map]) => {
            if (map && data) {
                (map.getSource("stops-before") as maplibregl.GeoJSONSource).setData(data.before);
                (map.getSource("stops-after") as maplibregl.GeoJSONSource).setData(data.after);
            }
        })
    );

    // Skipped stops red circles geojson
    createEffect(
        on(
            [skippedStopsGeoJson, map],
            ([data, map]) =>
                map?.getSource("skipped-stops") &&
                data &&
                (map!.getSource("skipped-stops") as maplibregl.GeoJSONSource).setData(data)
        )
    );

    // Current location marker
    createEffect(
        on([mapLocation.currentLocation, map], ([loc, map]) => {
            if (!map) return;

            if (loc) {
                markers.currentLocation.setLngLat([loc.lng, loc.lat]).addTo(map);
            } else {
                markers.currentLocation.remove();
            }
        })
    );

    // Selected location marker
    createEffect(
        on(
            [mapLocation.selectedLocation, mapLocation.showSelectedMarker, map],
            ([loc, show, map]) => {
                if (!map) return;

                if (loc && show) {
                    markers.selectedLocation.setLngLat([loc.lng, loc.lat]).addTo(map);
                } else {
                    markers.selectedLocation.remove();
                }
            }
        )
    );

    // Route shape colors/styles
    createEffect(
        on([routeColor, map], ([colors, map]) => {
            if (!map?.isStyleLoaded()) return;
            map.setPaintProperty("shape-before", "line-color", colors.before.fill);
            map.setPaintProperty("shape-after", "line-color", colors.after.fill);
            map.setPaintProperty("skipped-stops", "circle-color", colors.skippedStopFill);
            map.setPaintProperty("stops-before-border", "circle-color", colors.before.border);
            map.setPaintProperty("stops-before-fill", "circle-color", colors.before.fill);
            map.setPaintProperty("stops-after-border", "circle-color", colors.after.border);
            map.setPaintProperty("stops-after-fill", "circle-color", colors.after.fill);
        })
    );

    // Vehicle markers
    const vehicleMarkers = new Map<
        string,
        {
            marker: maplibregl.Marker;
            dispose: () => void;
            tripSignal: Signal<ScheduledTripDocument>;
        }
    >();
    createEffect(
        on(
            [map, vehicles],
            ([map, vehiclesList]) => {
                if (!map) return;

                for (const trip of vehiclesList) {
                    if (!trip.current_position?.longitude || !trip.current_position?.latitude)
                        continue;
                    const lngLat: [longitude: number, latitude: number] = [
                        trip.current_position.longitude,
                        trip.current_position.latitude,
                    ];

                    if (!vehicleMarkers.has(trip._id)) {
                        const tripSignal = createSignal(trip);

                        const container = document.createElement("div");
                        const dispose = render(
                            () => (
                                <ResponsiveDialog>
                                    <ResponsiveDialogTrigger
                                        as={VehicleMarkerComponent}
                                        trip={tripSignal[0]}
                                    >
                                        {null}
                                    </ResponsiveDialogTrigger>
                                    <ResponsiveDialogContent class="px-0 max-h-[80dvh] min-h-[50dvh] md:min-h-36 flex flex-col gap-1 justify-start">
                                        {/* Need to be wrapped in <Show> to trigger/pass in reactivity */}
                                        <Show when={tripSignal[0]()}>
                                            {(trip) => (
                                                <TripVehicleInfo
                                                    trip={trip()}
                                                    stopId={props.stopId}
                                                />
                                            )}
                                        </Show>
                                    </ResponsiveDialogContent>
                                </ResponsiveDialog>
                            ),
                            container
                        );
                        const marker = new maplibregl.Marker({
                            element: container,
                        })
                            .setLngLat(lngLat)
                            .addTo(map);
                        vehicleMarkers.set(trip._id, {
                            marker,
                            dispose: () => {
                                marker.remove();
                                dispose();
                            },
                            tripSignal,
                        });
                    } else {
                        const { marker, tripSignal } = vehicleMarkers.get(trip._id)!;
                        marker.setLngLat(lngLat);
                        tripSignal[1](trip); // Update vehicle marker via signal
                    }
                }

                // Remove markers if the trip no longer exist
                for (const trip of vehicleMarkers.keys()) {
                    if (!vehiclesList.find((v) => v._id === trip)) {
                        const { marker, dispose } = vehicleMarkers.get(trip)!;
                        marker.remove();
                        dispose();
                        vehicleMarkers.delete(trip);
                    }
                }
            },
            { defer: true }
        )
    );
    onCleanup(() => vehicleMarkers.forEach(({ dispose }) => dispose()));

    return (
        <>
            <div ref={container} class="w-full h-full" />
        </>
    );
};

const VehicleMarkerComponent: Component<{
    trip: Accessor<ScheduledTripDocument>;
    onClick?: (trip: ScheduledTripDocument) => void;
}> = (props) => {
    const trip = () => props.trip();

    const calSecondsAgo = () => differenceInSeconds(new Date(), trip().position_updated_at);
    const [secondsAgo, setSecondsAgo] = createSignal(calSecondsAgo());
    const isNotAccepting = () =>
        trip().current_occupancy === OccupancyStatus.NOT_ACCEPTING_PASSENGERS ||
        trip().current_occupancy === OccupancyStatus.NOT_BOARDABLE;
    const percentageFromOccupancyStatus = () => {
        if (
            !trip().current_occupancy ||
            trip().current_occupancy === OccupancyStatus.NO_DATA_AVAILABLE
        )
            return -1;
        if (isNotAccepting()) return -2;
        if (trip().current_occupancy === OccupancyStatus.EMPTY) return 10;
        if (trip().current_occupancy === OccupancyStatus.MANY_SEATS_AVAILABLE) return 25;
        if (trip().current_occupancy === OccupancyStatus.FEW_SEATS_AVAILABLE) return 50;
        if (trip().current_occupancy === OccupancyStatus.STANDING_ROOM_ONLY) return 75;
        if (trip().current_occupancy === OccupancyStatus.CRUSHED_STANDING_ROOM_ONLY) return 95;
        return 100;
    };
    let interval: ReturnType<typeof setInterval>;
    onMount(() => {
        interval = setInterval(() => setSecondsAgo(calSecondsAgo()), 1000);
    });
    onCleanup(() => clearInterval(interval));
    return (
        <div
            class="relative flex flex-col items-center justify-center"
            onClick={() => props.onClick && props.onClick(trip())}
        >
            <div class={cn("rounded-full bg-background p-[2px]", isNotAccepting() ? "invert" : "")}>
                <ProgressCircle value={percentageFromOccupancyStatus()} class="w-10 h-10">
                    <BusFrontIcon size={20} />
                </ProgressCircle>
            </div>
            <Badge variant={"default"} class="text-xs w-min p-0 px-1">
                {secondsAgo()}s
            </Badge>
        </div>
    );
};

export default TripMap;
