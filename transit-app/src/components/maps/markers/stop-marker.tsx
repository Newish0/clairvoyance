import { cn } from "@/lib/utils";
import { mdiBusStop } from "@mdi/js";
import Icon from "@mdi/react";
import { Link } from "@tanstack/react-router";
import type { inferProcedureOutput } from "@trpc/server";
import { AnimatePresence, motion, MotionValue, useMotionValue, useTransform } from "framer-motion";
import { useEffect } from "react";
import { Marker, useMap } from "react-map-gl/maplibre";
import type { AppRouter } from "transit-api-core/types";
import { Badge } from "../../ui/badge";

type NearbyStop = inferProcedureOutput<AppRouter["stop"]["getNearby"]>[number];

export type StopMarkerInfo = NearbyStop;

export const StopMarkers: React.FC<{
    stops: StopMarkerInfo[];
}> = ({ stops }) => {
    const { current: map } = useMap();
    const zoom = useMotionValue(map?.getZoom() ?? 15);
    const scale = useTransform(zoom, [15, 18], [0.6, 1.0]);

    useEffect(() => {
        const handleZoom = () => zoom.set(map?.getZoom() ?? 15);

        map?.on("zoom", handleZoom);
        handleZoom();

        return () => {
            map?.off("zoom", handleZoom);
        };
    }, [map, zoom]);

    return (
        <AnimatePresence>
            {stops.map(
                (stop) =>
                    stop.location && (
                        <StopMarker
                            key={stop.id}
                            stopName={stop.name || "Unknown Stop"}
                            lng={stop.location.x}
                            lat={stop.location.y}
                            routeShortNames={stop.routes
                                ?.map((route) => route.shortName)
                                .filter((shortName) => shortName !== null)}
                            scale={scale}
                        />
                    ),
            )}
        </AnimatePresence>
    );
};

const StopMarker: React.FC<{
    stopName: string;
    lng: number;
    lat: number;
    routeShortNames?: string[];
    scale?: MotionValue<number>;
}> = ({ stopName, lng, lat, routeShortNames, scale }) => {
    return (
        <Marker longitude={lng} latitude={lat} anchor="bottom">
            <motion.div
                className="relative flex items-center gap-1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{ scale }}
            >
                <Link
                    to="/"
                    search={{
                        lat,
                        lng,
                    }}
                    className={cn(
                        "relative flex flex-col items-center justify-center",
                        "cursor-pointer transition-transform hover:scale-110 active:scale-95",
                        "bg-primary-foreground/60 backdrop-blur-sm",
                        "border shadow-xl size-8",
                        "rounded-xl",
                    )}
                >
                    <Icon path={mdiBusStop} size={0.8} className="drop-shadow-md opacity-75" />
                </Link>

                <div className="absolute left-8 m-2 w-24 line-clamp-2 leading-tight opacity-75">
                    {stopName}
                </div>

                <div className="absolute top-8 left-9 flex flex-wrap w-32">
                    {routeShortNames?.map((shortName, i) => (
                        <Badge
                            key={i}
                            variant="outline"
                            className="h-5 p-1 text-[10px] bg-primary-foreground/60 text-primary/60 backdrop-blur-sm"
                        >
                            {shortName}
                        </Badge>
                    ))}
                </div>
            </motion.div>
        </Marker>
    );
};
