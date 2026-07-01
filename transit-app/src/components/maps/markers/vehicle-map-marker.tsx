import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { DateArg } from "date-fns";
import { motion } from "framer-motion";
import { X } from "lucide-react";

import Icon from "@mdi/react";
import type { RouteType } from "database/models/enums";
import { useEffect, useState } from "react";
import { Marker, type MarkerProps } from "react-map-gl/maplibre";
import {
    VehiclePositionDetails,
    type VehiclePosition,
} from "../../trip-info/vehicle-position-details";
import {
    ResponsiveModal,
    ResponsiveModalContent,
    ResponsiveModalTrigger,
} from "../../ui/responsible-dialog";
import VehicleIcon from "@/components/vehicle-icon";

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
                    "bg-primary-foreground/60 text-[10px] text-muted-foreground font-medium px-2 py-0.5 leading-none rounded-full backdrop-blur-sm shadow-xl border whitespace-nowrap",
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
    targetStopSequence?: number;
    vehicleType?: RouteType;
    routeColor?: string; // Hex color for the route
    routeTextColor?: string; // Text color that contrasts with routeColor
    onClick?: () => void;
}

export function VehiclePositionMapMarker({
    vehiclePosition: vp,
    targetStopSequence,
    vehicleType = "BUS",
    routeColor = "var(--primary-foreground)",
    routeTextColor = "var(--primary)",
    ...markerProps
}: VehiclePositionMapMarkerProps) {
    const getOccupancyState = (): {
        fillPercentage: number;
        hasData: boolean;
        isBoardable: boolean;
    } => {
        if (
            vp.occupancyStatus === "NOT_ACCEPTING_PASSENGERS" ||
            vp.occupancyStatus === "NOT_BOARDABLE"
        ) {
            return { fillPercentage: 100, hasData: true, isBoardable: false };
        }

        const hasPercentageData = vp.occupancyPercentage !== null;
        const hasStatusData =
            vp.occupancyStatus !== null && vp.occupancyStatus !== "NO_DATA_AVAILABLE";

        if (!hasPercentageData && !hasStatusData) {
            return { fillPercentage: 0, hasData: false, isBoardable: true };
        }

        let fillPercentage = 0;

        switch (vp.occupancyStatus) {
            case "EMPTY":
                fillPercentage = 0;
                break;
            case "MANY_SEATS_AVAILABLE":
                fillPercentage = 25;
                break;
            case "FEW_SEATS_AVAILABLE":
                fillPercentage = 50;
                break;
            case "STANDING_ROOM_ONLY":
                fillPercentage = 75;
                break;
            case "CRUSHED_STANDING_ROOM_ONLY":
                fillPercentage = 90;
                break;
            case "FULL":
                fillPercentage = 100;
                break;
        }

        if (hasPercentageData) {
            const occupancyPercentage = Math.min(100, Math.max(0, vp.occupancyPercentage!));

            // Ignore erroneous percentage data that deviates significantly from status's suggested value.
            // This is because some agencies report both status and percentage, but the percentage is a dummy value or inaccurate.
            if (Math.abs(occupancyPercentage - fillPercentage) < 25) {
                fillPercentage = occupancyPercentage;
            }
        }

        if (fillPercentage === 0 && hasStatusData) fillPercentage = 10;

        return { fillPercentage, hasData: true, isBoardable: true };
    };

    const { fillPercentage, hasData, isBoardable } = getOccupancyState();

    return (
        <Marker {...markerProps}>
            <ResponsiveModal>
                <ResponsiveModalTrigger asChild>
                    <button className="relative flex flex-col items-center cursor-pointer transition-transform hover:scale-110 active:scale-95">
                        <div
                            className={cn(
                                "bg-primary-foreground/60 backdrop-blur-sm",
                                "shadow-xl relative flex h-12 w-12 items-center justify-center rounded-full",
                                hasData ? "border" : "border-2",
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
                                    animate={{ opacity: 0.5 }}
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
                                routeType={vehicleType}
                                className="relative z-10 drop-shadow-md dark:saturate-75 brightness-90"
                                size={1}
                                color={
                                    !hasData
                                        ? routeColor
                                        : fillPercentage > 65
                                          ? routeTextColor
                                          : routeColor
                                }
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
                </ResponsiveModalTrigger>
                <ResponsiveModalContent className="min-w-1/2 max-w-3xl bg-primary-foreground/60 backdrop-blur-md">
                    <VehiclePositionDetails
                        vehiclePosition={vp}
                        targetStopSeq={targetStopSequence}
                        className="border-0 shadow-none bg-transparent"
                    />
                </ResponsiveModalContent>
            </ResponsiveModal>
        </Marker>
    );
}
