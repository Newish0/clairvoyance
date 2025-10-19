import { Bus, Train, Drama as Tram, Ship, Cable, X } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
    OccupancyStatus,
    type VehiclePosition,
} from "../../../../gtfs-processor/shared/gtfs-db-types";
import { Marker, type MarkerProps } from "react-map-gl/maplibre";
import type { DateArg } from "date-fns";

function FreshnessBadge({ timestamp }: { timestamp: DateArg<Date> }) {
    const [, setTick] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setTick((t) => t + 1);
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const now = new Date();
    const ts = new Date(timestamp);
    const secondsAgo = Math.floor((now.getTime() - ts.getTime()) / 1000);

    let displayText = "";
    if (secondsAgo < 60) {
        displayText = `${secondsAgo}s`;
    } else if (secondsAgo < 3600) {
        const minutes = Math.floor(secondsAgo / 60);
        displayText = `${minutes}m`;
    } else {
        const hours = Math.floor(secondsAgo / 3600);
        displayText = `${hours}h`;
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: 0.12 }}
            aria-hidden={false}
        >
            <Badge
                variant="outline"
                className={cn(
                    "bg-primary-foreground/60 text-[10px] font-medium px-2 py-0.5 leading-none rounded-full backdrop-blur-sm shadow-xl border-1 whitespace-nowrap"
                )}
            >
                {displayText}
            </Badge>
        </motion.div>
    );
}

/* --- VehiclePositionMapMarker (main) --- */
interface VehiclePositionMapMarkerProps extends MarkerProps {
    vehiclePosition: VehiclePosition;
    vehicleType?: "bus" | "train" | "tram" | "ferry" | "cable_car";
    routeColor?: string; // Hex color for the route
    routeTextColor?: string; // Text color that contrasts with routeColor
    onClick?: () => void;
}

export function VehiclePositionMapMarker({
    vehiclePosition: vp,
    vehicleType = "bus",
    routeColor = "#3b82f6",
    routeTextColor = "#ffffff",
    ...markerProps
}: VehiclePositionMapMarkerProps) {
    const getOccupancyState = (): {
        fillPercentage: number;
        hasData: boolean;
        isBoardable: boolean;
    } => {
        if (
            vp.occupancy_status === OccupancyStatus.NOT_ACCEPTING_PASSENGERS ||
            vp.occupancy_status === OccupancyStatus.NOT_BOARDABLE
        ) {
            return { fillPercentage: 100, hasData: true, isBoardable: false };
        }

        const hasPercentageData = vp.occupancy_percentage !== null;
        const hasStatusData =
            vp.occupancy_status !== null &&
            vp.occupancy_status !== OccupancyStatus.NO_DATA_AVAILABLE;

        if (!hasPercentageData && !hasStatusData) {
            return { fillPercentage: 0, hasData: false, isBoardable: true };
        }

        let fillPercentage = 0;
        if (hasPercentageData) {
            fillPercentage = Math.min(100, Math.max(0, vp.occupancy_percentage!));
        } else if (vp.occupancy_status) {
            switch (vp.occupancy_status) {
                case OccupancyStatus.EMPTY:
                    fillPercentage = 0;
                    break;
                case OccupancyStatus.MANY_SEATS_AVAILABLE:
                    fillPercentage = 25;
                    break;
                case OccupancyStatus.FEW_SEATS_AVAILABLE:
                    fillPercentage = 50;
                    break;
                case OccupancyStatus.STANDING_ROOM_ONLY:
                    fillPercentage = 75;
                    break;
                case OccupancyStatus.CRUSHED_STANDING_ROOM_ONLY:
                    fillPercentage = 90;
                    break;
                case OccupancyStatus.FULL:
                    fillPercentage = 100;
                    break;
            }
        }

        if (fillPercentage === 0 && hasStatusData) fillPercentage = 8;

        return { fillPercentage, hasData: true, isBoardable: true };
    };

    const { fillPercentage, hasData, isBoardable } = getOccupancyState();

    const VehicleIcon = {
        bus: Bus,
        train: Train,
        tram: Tram,
        ferry: Ship,
        cable_car: Cable,
    }[vehicleType];

    return (
        <Marker {...markerProps}>
            <button className="relative flex flex-col items-center cursor-pointer transition-transform hover:scale-110 active:scale-95">
                <div
                    className={cn(
                        "bg-primary-foreground/60 shadow-xl backdrop-blur-sm relative flex h-12 w-12 items-center justify-center rounded-full",
                        hasData ? "border-1" : "border-2"
                    )}
                    style={{
                        border: hasData
                            ? `1px solid rgba(255, 255, 255, 0.2)`
                            : `2px dashed ${routeColor}`,
                    }}
                >
                    {hasData && (
                        <motion.div
                            className="absolute inset-0 rounded-full overflow-hidden"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 0.22 }}
                            transition={{ duration: 0.3 }}
                        >
                            <motion.div
                                className="absolute inset-0 rounded-full"
                                style={{
                                    background: routeColor,
                                }}
                                initial={{ y: "100%" }}
                                animate={{ y: `${100 - fillPercentage}%` }}
                                transition={{
                                    duration: 0.8,
                                    ease: [0.4, 0.0, 0.2, 1],
                                    delay: 0.1,
                                }}
                            />
                        </motion.div>
                    )}

                    <VehicleIcon
                        className="relative z-10 drop-shadow-md"
                        size={24}
                        style={{
                            color: !hasData
                                ? routeColor
                                : fillPercentage > 60
                                  ? routeTextColor
                                  : "var(--primary)",
                        }}
                    />

                    {!isBoardable && (
                        <motion.div
                            className="absolute inset-0 flex items-center justify-center"
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ duration: 0.3, delay: 0.4 }}
                        >
                            <X
                                size={28}
                                strokeWidth={3}
                                style={{
                                    color: routeTextColor,
                                    filter: "drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))",
                                }}
                            />
                        </motion.div>
                    )}
                </div>

                <div className="-translate-y-1/2">
                    <FreshnessBadge timestamp={vp.timestamp} />
                </div>
            </button>
        </Marker>
    );
}
