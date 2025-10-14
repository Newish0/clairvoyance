import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { differenceInSeconds, type DateArg } from "date-fns";
import { Clock } from "lucide-react";
import { RealTimeIndicator } from "../ui/realtime-indicator";
import { DepartureTime } from "./depature-time";
import { Link } from "@tanstack/react-router";
import type { Direction } from "../../../../gtfs-processor/shared/gtfs-db-types";

export interface DepartureCardProps {
    agencyId: string;
    routeId: string;
    routeShortName: string;
    routeColor?: string | null;
    routeTextColor?: string | null;
    tripInstanceId: string;
    tripHeadsign: string;
    stopId: string;
    stopName: string;
    direction?: Direction | null;
    scheduledArrivalTime?: DateArg<Date> | null;
    predictedArrivalTime?: DateArg<Date> | null;
    scheduledDepartureTime?: DateArg<Date> | null;
    predictedDepartureTime?: DateArg<Date> | null;
    isCancelled?: boolean;
}

export const DepartureCard: React.FC<DepartureCardProps> = (props) => {
    const lastStopDropOffOnly = !props.scheduledDepartureTime;

    const scheduledTime = lastStopDropOffOnly
        ? props.scheduledArrivalTime
        : props.scheduledDepartureTime;
    const predictedTime = lastStopDropOffOnly
        ? props.predictedArrivalTime
        : props.predictedDepartureTime;

    const time = predictedTime ?? scheduledTime;

    const delayInSeconds =
        scheduledTime && predictedTime ? differenceInSeconds(predictedTime, scheduledTime) : null;

    // TODO: Use real URL
    return (
        <Link
            to="/nt"
            search={{
                agencyId: props.agencyId,
                routeId: props.routeId,
                stopId: props.stopId,
                tripInstanceId: props.tripInstanceId,
                directionId: props.direction || undefined,
            }}
        >
            <div className="flex items-center justify-between py-2 border-b last:border-b-0">
                <div className="overflow-hidden">
                    <div className="flex items-center gap-2">
                        <div className="w-12 flex-shrink-0 flex justify-center">
                            <Badge
                                variant="secondary"
                                className="text-sm font-bold"
                                style={{
                                    backgroundColor: props.routeColor
                                        ? `#${props.routeColor}`
                                        : undefined,
                                    color: props.routeTextColor
                                        ? `#${props.routeTextColor}`
                                        : undefined,
                                }}
                            >
                                {props.routeShortName}
                            </Badge>
                        </div>

                        <div className="space-y-1 overflow-hidden">
                            <h4 className="text-sm font-semibold text-wrap">
                                {props.tripHeadsign}
                            </h4>
                            <p className="text-xs text-muted-foreground truncate">
                                At {props.stopName}
                            </p>
                        </div>
                    </div>
                </div>
                <div className="relative overflow-visible p-2 mr-1 min-w-16">
                    <div
                        className={cn(
                            "flex items-center justify-end space-x-1 h-8",
                            props.isCancelled ? "line-through text-muted-foreground" : ""
                        )}
                    >
                        {lastStopDropOffOnly && (
                            <Badge variant="secondary" className="text-sm font-bold">
                                Drop Off Only
                            </Badge>
                        )}
                        <Clock className="h-3 w-3" />

                        <DepartureTime datetime={time || null} />
                    </div>

                    {delayInSeconds != null && <RealTimeIndicator delaySeconds={delayInSeconds} />}

                    {/* {import.meta.env.DEV && props.predictedDepartureTime && (
                        <code className="text-muted-foreground text-xs">
                            ({props.scheduledDepartureTime.toLocaleTimeString()} →{" "}
                            {props.predictedDepartureTime.toLocaleTimeString()}, Δ {delayInSeconds}
                            s)
                        </code>
                    )} */}
                </div>
            </div>
        </Link>
    );
};
