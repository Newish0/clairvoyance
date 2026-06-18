import { cn } from "@/lib/utils";
import { mdiBusStop } from "@mdi/js";
import Icon from "@mdi/react";
import { Link } from "@tanstack/react-router";
import type { inferProcedureOutput } from "@trpc/server";
import { AnimatePresence, motion } from "framer-motion";
import { LngLat } from "maplibre-gl";
import { Marker, useMap } from "react-map-gl/maplibre";
import type { AppRouter } from "transit-api";
import { Badge } from "../../ui/badge";

type NearbyStop = inferProcedureOutput<AppRouter["stop"]["getNearby"]>[number];

export type StopMarkerInfo = NearbyStop;

export const StopMarkers: React.FC<{
    stops: StopMarkerInfo[];
}> = ({ stops }) => {
    const { current: map } = useMap();

    const isInBound = (coord: { x: number; y: number }) =>
        map?.getBounds().contains(new LngLat(coord.x, coord.y));

    return (
        <AnimatePresence>
            {stops.map(
                (stop) =>
                    stop.location &&
                    isInBound(stop.location) && (
                        <StopMarker
                            key={stop.id}
                            stopName={stop.name || "Unknown Stop"}
                            lng={stop.location.x}
                            lat={stop.location.y}
                            routeShortNames={stop.routes
                                .map((route) => route.shortName)
                                .filter((shortName) => shortName !== null)}
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
    routeShortNames: string[];
}> = ({ stopName, lng, lat, routeShortNames }) => {
    return (
        <Marker longitude={lng} latitude={lat} anchor="bottom">
            <motion.div
                className="relative flex items-center gap-1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
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

                <div className="absolute -bottom-6 left-9 space-x-0.5 space-y-0.5">
                    {routeShortNames?.map((shortName, i) => (
                        <Badge
                            key={i}
                            variant="outline"
                            className="h-5 inline p-1 text-[10px] bg-primary-foreground/60 text-primary/60 backdrop-blur-sm"
                        >
                            {shortName}
                        </Badge>
                    ))}
                </div>
            </motion.div>
        </Marker>
    );
};
