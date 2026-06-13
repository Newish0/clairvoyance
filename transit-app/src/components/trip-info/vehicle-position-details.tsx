import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { trpc } from "@/main";
import { useQuery } from "@tanstack/react-query";
import type { OccupancyStatus, VehicleStopStatus } from "database/models/enums";
import * as tables from "database/models/tables";
import { differenceInMinutes, differenceInSeconds } from "date-fns";
import {
    Accessibility,
    AlertCircle,
    Bus,
    Clock,
    Info,
    MapPin,
    Navigation,
    TrendingUp,
    Users,
} from "lucide-react";

export type VehiclePosition = typeof tables.vehiclePositions.$inferSelect;

interface VehiclePositionDetailsProps {
    vehiclePosition: VehiclePosition;
    targetStopSeq?: number;
    className?: string;
}

export function VehiclePositionDetails({
    vehiclePosition,
    targetStopSeq,
    className,
}: VehiclePositionDetailsProps) {
    const { isLoading, data: tripInst } = useQuery({
        ...trpc.tripInstance.getById.queryOptions(vehiclePosition.tripInstanceId!),
        enabled: vehiclePosition.tripInstanceId !== null,
    });

    const getStatusBadge = (status: VehicleStopStatus | null) => {
        if (!status) return null;

        const getStatusConfig = (status: VehicleStopStatus) => {
            switch (status) {
                case "INCOMING_AT":
                    return {
                        label: "Incoming",
                        variant: "default",
                    } as const;
                case "STOPPED_AT":
                    return {
                        label: "Stopped",
                        variant: "secondary",
                    } as const;
                case "IN_TRANSIT_TO":
                    return {
                        label: "In Transit",
                        variant: "outline",
                    } as const;
            }
        };

        const config = getStatusConfig(status);
        return (
            <Badge variant={config.variant} className="font-medium">
                {config.label}
            </Badge>
        );
    };

    const getOccupancyInfo = (status: OccupancyStatus | null) => {
        switch (status) {
            case "EMPTY":
                return {
                    label: "Empty",
                    color: "text-green-400",
                } as const;
            case "MANY_SEATS_AVAILABLE":
                return {
                    label: "Many Seats",
                    color: "text-green-400",
                } as const;
            case "FEW_SEATS_AVAILABLE":
                return {
                    label: "Few Seats",
                    color: "text-yellow-400",
                } as const;
            case "STANDING_ROOM_ONLY":
                return {
                    label: "Standing Room",
                    color: "text-orange-400",
                } as const;
            case "CRUSHED_STANDING_ROOM_ONLY":
                return {
                    label: "Crowded",
                    color: "text-red-400",
                } as const;
            case "FULL":
                return {
                    label: "Full",
                    color: "text-red-400",
                } as const;
            case "NOT_ACCEPTING_PASSENGERS":
                return {
                    label: "Not Accepting",
                    color: "text-gray-400",
                } as const;
            case "NOT_BOARDABLE":
                return {
                    label: "Not Boardable",
                    color: "text-gray-400",
                } as const;
            case "NO_DATA_AVAILABLE":
            default: {
                return {
                    label: "No Data",
                    color: "text-gray-400",
                } as const;
            }
        }
    };

    const formatTimestamp = (date: Date) => {
        const now = new Date();
        const diff = Math.floor((now.getTime() - new Date(date).getTime()) / 1000);

        if (diff < 60) return "Just now";
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return new Date(date).toLocaleString();
    };

    const formatETA = (etaDate: Date) => {
        const now = new Date();
        const diff = Math.floor((new Date(etaDate).getTime() - now.getTime()) / 1000);

        if (diff < 60) return "Arriving now";
        if (diff < 3600) return `${Math.floor(diff / 60)} min`;
        return new Date(etaDate).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    const occupancyInfo = vehiclePosition && getOccupancyInfo(vehiclePosition.occupancyStatus);
    const tripName = tripInst?.trip?.headsign;

    const targetStopTimeInstIdx =
        tripInst?.stopTimeInstances.findIndex((st) => st.stopSequence === targetStopSeq) ?? -1;
    const targetStopTimeInst =
        targetStopTimeInstIdx > -1 ? tripInst?.stopTimeInstances[targetStopTimeInstIdx] : undefined;
    const vehicleCurStopTimeInstIdx =
        (vehiclePosition.currentStopSequence !== null
            ? tripInst?.stopTimeInstances.findIndex(
                  (st) => st.stopSequence === vehiclePosition.currentStopSequence,
              )
            : tripInst?.stopTimeInstances.findIndex(
                  (st) =>
                      st.shapeDistTraveled !== null &&
                      vehiclePosition.shapeDistTraveled !== null &&
                      st.shapeDistTraveled >= vehiclePosition.shapeDistTraveled,
              )) ?? -1;

    const stopName = targetStopTimeInst?.stop?.name;
    const stopsAway =
        targetStopTimeInstIdx !== -1 && vehicleCurStopTimeInstIdx !== -1
            ? targetStopTimeInstIdx - vehicleCurStopTimeInstIdx
            : null;

    const eta =
        targetStopTimeInst?.predictedArrivalTime ?? targetStopTimeInst?.scheduledArrivalTime;

    const minutesSinceETA = eta ? differenceInMinutes(new Date(), eta) : undefined;
    const timeSincePassing =
        minutesSinceETA && minutesSinceETA > 0 ? `${minutesSinceETA} min` : null;

    const realTimeDelaySeconds =
        targetStopTimeInst?.predictedArrivalTime && targetStopTimeInst?.scheduledArrivalTime
            ? differenceInSeconds(
                  targetStopTimeInst?.predictedArrivalTime,
                  targetStopTimeInst?.scheduledArrivalTime,
              )
            : undefined;
    const realTimeDelay =
        realTimeDelaySeconds !== undefined ? Math.round(realTimeDelaySeconds / 60) : undefined;

    // TODO: Fetch vehicle info and use enum
    const isAccessible = "Not Accessible";

    const delayColor = cn({
        "text-red-400": realTimeDelaySeconds !== undefined && realTimeDelaySeconds > 180,
        "text-orange-400":
            realTimeDelaySeconds !== undefined &&
            realTimeDelaySeconds > 30 &&
            realTimeDelaySeconds <= 180,
        "text-green-400":
            realTimeDelaySeconds !== undefined &&
            realTimeDelaySeconds >= -30 &&
            realTimeDelaySeconds <= 30,
        "text-blue-400": realTimeDelaySeconds !== undefined && realTimeDelaySeconds < -30,
    });

    if (!vehiclePosition) {
        return <VehiclePositionEmpty className={className} />;
    }

    if (isLoading) {
        return <VehiclePositionSkeleton className={className} />;
    }

    return (
        <Card className={cn("w-full", className)}>
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg md:text-xl font-bold text-balance">
                            {tripName || "Unknown Trip"}
                        </CardTitle>
                        {stopName && (
                            <p className="text-sm text-muted-foreground mt-1 text-pretty">
                                {stopName}
                            </p>
                        )}
                    </div>
                    {getStatusBadge(vehiclePosition.currentStatus)}
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* Stop and ETA Information */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {stopsAway !== null && (
                        <div className="flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="min-w-0">
                                <p className="text-xs text-muted-foreground">Stops Away</p>
                                <p className="font-semibold">
                                    {stopsAway <= 1 ? `${stopsAway} stop` : `${stopsAway} stops`}
                                </p>
                            </div>
                        </div>
                    )}

                    {(eta || timeSincePassing !== null) && (
                        <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="min-w-0">
                                <p className="text-xs text-muted-foreground">
                                    {eta ? "ETA" : "Passed"}
                                </p>
                                <p className="font-semibold">
                                    {eta
                                        ? formatETA(eta)
                                        : timeSincePassing !== null
                                          ? `${timeSincePassing} min ago`
                                          : "Unknown"}
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Real-time Delay */}
                {realTimeDelay !== undefined && realTimeDelay !== 0 && (
                    <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                        <AlertCircle className={cn("h-4 w-4  shrink-0", delayColor)} />
                        <div className="min-w-0">
                            <p className="text-sm font-medium">
                                {realTimeDelay > 0 ? "Delayed" : "Early"} by{" "}
                                {Math.abs(realTimeDelay)} min
                            </p>
                        </div>
                    </div>
                )}

                <Separator />

                {/* Occupancy and Accessibility */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {occupancyInfo && (
                        <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="min-w-0">
                                <p className="text-xs text-muted-foreground">Occupancy</p>
                                <p className={cn("font-semibold", occupancyInfo.color)}>
                                    {occupancyInfo.label}
                                </p>
                                {/* Let's not use occupancy percentage for no because some agencies don't provide it or it's not accurate. */}
                                {/* {vehiclePosition.occupancy_percentage !== null && (
                                    <p className="text-xs text-muted-foreground">
                                        {vehiclePosition.occupancy_percentage}% full
                                    </p>
                                )} */}
                            </div>
                        </div>
                    )}

                    {isAccessible !== undefined && (
                        <div className="flex items-center gap-2">
                            <Accessibility className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="min-w-0">
                                <p className="text-xs text-muted-foreground">Accessibility</p>
                                <p className="font-semibold">
                                    {isAccessible ? "Accessible" : "Not Accessible"}
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                <Separator />

                {/* Vehicle Details */}
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <Bus className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                            <p className="text-xs text-muted-foreground">Vehicle ID</p>
                            <p className="text-sm font-mono">{vehiclePosition.vehicleId}</p>
                        </div>
                    </div>

                    {vehiclePosition.bearing !== null && (
                        <div className="flex items-center gap-2">
                            <Navigation className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="text-xs text-muted-foreground">Bearing</p>
                                <p className="text-sm">{vehiclePosition.bearing.toFixed(2)}°</p>
                            </div>
                        </div>
                    )}

                    {vehiclePosition.speed !== null && (
                        <div className="flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="text-xs text-muted-foreground">Speed</p>
                                <p className="text-sm">{vehiclePosition.speed.toFixed(2)} m/s</p>
                            </div>
                        </div>
                    )}

                    <div className="flex items-center gap-2">
                        <Info className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                            <p className="text-xs text-muted-foreground">Last Updated</p>
                            <p className="text-sm">{formatTimestamp(vehiclePosition.timestamp)}</p>
                        </div>
                    </div>
                </div>

                {/* Position Coordinates */}
                {
                    <>
                        <Separator />
                        <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="text-xs text-muted-foreground">Position</p>
                                <p className="text-xs font-mono text-muted-foreground">
                                    {vehiclePosition.location.x.toFixed(6)},{" "}
                                    {vehiclePosition.location.y.toFixed(6)}
                                </p>
                            </div>
                        </div>
                    </>
                }
            </CardContent>
        </Card>
    );
}

function VehiclePositionSkeleton({ className }: { className?: string }) {
    return (
        <Card className={cn("w-full", className)}>
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 space-y-2">
                        <Skeleton className="h-6 w-3/4" />
                        <Skeleton className="h-4 w-1/2" />
                    </div>
                    <Skeleton className="h-6 w-20" />
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex items-center gap-2">
                        <Skeleton className="h-4 w-4 shrink-0" />
                        <div className="flex-1 space-y-1">
                            <Skeleton className="h-3 w-16" />
                            <Skeleton className="h-5 w-20" />
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Skeleton className="h-4 w-4 shrink-0" />
                        <div className="flex-1 space-y-1">
                            <Skeleton className="h-3 w-16" />
                            <Skeleton className="h-5 w-20" />
                        </div>
                    </div>
                </div>

                <Separator />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex items-center gap-2">
                        <Skeleton className="h-4 w-4 shrink-0" />
                        <div className="flex-1 space-y-1">
                            <Skeleton className="h-3 w-20" />
                            <Skeleton className="h-5 w-24" />
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Skeleton className="h-4 w-4 shrink-0" />
                        <div className="flex-1 space-y-1">
                            <Skeleton className="h-3 w-20" />
                            <Skeleton className="h-5 w-24" />
                        </div>
                    </div>
                </div>

                <Separator />

                <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center gap-2">
                            <Skeleton className="h-4 w-4 shrink-0" />
                            <div className="flex-1 space-y-1">
                                <Skeleton className="h-3 w-20" />
                                <Skeleton className="h-4 w-32" />
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

function VehiclePositionEmpty({ className }: { className?: string }) {
    return (
        <Card className={cn("w-full", className)}>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Bus className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="font-semibold text-lg mb-2">No Vehicle Data</h3>
                <p className="text-sm text-muted-foreground max-w-sm text-pretty">
                    Vehicle position information is currently unavailable. Please check back later
                    or try refreshing.
                </p>
            </CardContent>
        </Card>
    );
}
