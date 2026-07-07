import { Badge } from "@/components/ui/badge";
import { RealTimeIndicator } from "@/components/ui/realtime-indicator";
import VehicleIcon from "@/components/vehicle-icon";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import { differenceInSeconds } from "date-fns";
import { Clock } from "lucide-react";
import { DepartureTime } from "./departure-time";
import type { Departure } from "./types";
import { ensureHexColorStartsWithHash } from "@/utils/css";

const resolveDepartureInfo = (departure: Departure) => {
    const lastStopDropOffOnly = !departure.scheduledDepartureTime;

    const routeShortName =
        departure.routeShortName || departure.routeLongName || `Route ${departure.routeId}`;

    const tripHeadsign = departure.tripHeadsign || "Unknown Trip";

    const stopName = departure.stopName || "Unknown Stop";

    const isSkipped = departure.scheduleRelationship === "SKIPPED";

    const scheduledTime = lastStopDropOffOnly
        ? departure.scheduledArrivalTime
        : departure.scheduledDepartureTime;
    const predictedTime = lastStopDropOffOnly
        ? departure.predictedArrivalTime
        : departure.predictedDepartureTime;

    const time = predictedTime ?? scheduledTime;

    const delayInSeconds =
        scheduledTime && predictedTime ? differenceInSeconds(predictedTime, scheduledTime) : null;

    return {
        lastStopDropOffOnly,
        routeShortName,
        tripHeadsign,
        stopName,
        isSkipped,
        time,
        delayInSeconds,
    };
};

export interface DeparturesCardProps {
    departures: Departure[];
    oppositeStopId?: number;
}

export const DeparturesCard: React.FC<DeparturesCardProps> = ({ departures, oppositeStopId }) => {
    // Invalid state
    if (departures.length <= 0) {
        return (
            <div className="p-2 text-destructive">
                Unexpected data. Must have at least one departure
            </div>
        );
    }

    // Use multi card if multiple departures or we MUST display
    // long route name because there is not short name
    if (departures.length > 1 || !departures[0].routeShortName) {
        return <MultiDeparturesCard departures={departures} oppositeStopId={oppositeStopId} />;
    }

    return <SingleDepartureCard departure={departures[0]} oppositeStopId={oppositeStopId} />;
};

const MultiDeparturesCard: React.FC<{ departures: Departure[]; oppositeStopId?: number }> = ({
    departures,
    oppositeStopId,
}) => {
    const d = departures[0];
    const { routeShortName, stopName } = resolveDepartureInfo(d);

    return (
        <Link
            to="/nt"
            search={{
                agencyId: d.agencyId,
                routeId: d.routeId,
                stopId: d.stopId,
                tripInstanceId: d.tripInstanceId,
                direction: d.direction || undefined,
                oppositeStopId,
            }}
        >
            <div className="py-2 space-y-1">
                <div className="flex gap-2 items-center">
                    {d.routeType !== "BUS" && (
                        <VehicleIcon
                            routeType={d.routeType}
                            size={1}
                            color={ensureHexColorStartsWithHash(d.routeColor)}
                        />
                    )}
                    <Badge
                        variant="default"
                        className="text-sm font-bold py-0 min-w-9"
                        style={{
                            backgroundColor: ensureHexColorStartsWithHash(d.routeColor),
                            color: ensureHexColorStartsWithHash(d.routeTextColor),
                        }}
                    >
                        {routeShortName}
                    </Badge>

                    <div className="text-sm text-muted-foreground capitalize">
                        {d.direction?.toLocaleLowerCase()}
                    </div>
                </div>

                <p className="ml-1 text-xs text-muted-foreground truncate">At {stopName}</p>

                <div className="space-y-0 ml-1">
                    {departures.map((d, i) => (
                        <MultiDeparturesRow key={i} departure={d} />
                    ))}
                </div>
            </div>
        </Link>
    );
};

const MultiDeparturesRow: React.FC<{ departure: Departure }> = ({ departure }) => {
    const {
        lastStopDropOffOnly,
        routeShortName,
        tripHeadsign,
        stopName,
        isSkipped,
        time,
        delayInSeconds,
    } = resolveDepartureInfo(departure);

    return (
        <div className="flex gap-2 justify-between items-center">
            <div className="text-sm font-medium leading-tight truncate">{tripHeadsign}</div>

            <div className="relative overflow-visible mr-1">
                <div
                    className={cn(
                        "flex items-center justify-end space-x-1 h-8",
                        isSkipped ? "line-through text-muted-foreground" : "",
                    )}
                >
                    {lastStopDropOffOnly && (
                        <Badge
                            variant="secondary"
                            className="text-[0.5rem] font-bold py-0.5 px-1.5"
                        >
                            Drop Off
                        </Badge>
                    )}

                    {departure.isLast ||
                        (true && (
                            <Badge
                                variant="default"
                                className="text-[0.5rem] font-bold uppercase py-0.5 px-1.5"
                            >
                                Last
                            </Badge>
                        ))}

                    {delayInSeconds == null && <Clock className="size-3" />}

                    <DepartureTime datetime={time || null} />

                    {delayInSeconds != null && (
                        <RealTimeIndicator delaySeconds={delayInSeconds} className="-mt-4" />
                    )}
                </div>
            </div>
        </div>
    );
};

const SingleDepartureCard: React.FC<{
    departure: Departure;
    oppositeStopId?: number;
}> = ({ departure, oppositeStopId }) => {
    const {
        lastStopDropOffOnly,
        routeShortName,
        tripHeadsign,
        stopName,
        isSkipped,
        time,
        delayInSeconds,
    } = resolveDepartureInfo(departure);

    return (
        <Link
            to="/nt"
            search={{
                agencyId: departure.agencyId,
                routeId: departure.routeId,
                stopId: departure.stopId,
                tripInstanceId: departure.tripInstanceId,
                direction: departure.direction || undefined,
                oppositeStopId,
            }}
        >
            <div className="flex items-center justify-between">
                <div className="overflow-hidden">
                    <div className="flex items-center gap-2">
                        <Badge
                            variant="default"
                            className="text-sm font-bold w-9"
                            style={{
                                backgroundColor: ensureHexColorStartsWithHash(departure.routeColor),
                                color: ensureHexColorStartsWithHash(departure.routeTextColor),
                            }}
                        >
                            {routeShortName}
                        </Badge>

                        <div className="space-y-1 overflow-hidden">
                            <h4 className="text-sm font-semibold truncate">{tripHeadsign}</h4>
                            <p className="text-xs text-muted-foreground truncate">At {stopName}</p>
                        </div>
                    </div>
                </div>
                <div className="relative overflow-visible mr-1">
                    <div
                        className={cn(
                            "flex items-center justify-end space-x-1 h-8",
                            isSkipped ? "line-through text-muted-foreground" : "",
                        )}
                    >
                        {lastStopDropOffOnly && (
                            <Badge
                                variant="secondary"
                                className="text-[0.5rem] font-bold py-0.5 px-1.5"
                            >
                                Drop Off
                            </Badge>
                        )}

                        {departure.isLast && (
                            <Badge
                                variant="default"
                                className="text-[0.5rem] font-bold uppercase py-0.5 px-1.5"
                            >
                                Last
                            </Badge>
                        )}

                        {delayInSeconds == null && <Clock className="size-3" />}

                        <DepartureTime datetime={time || null} />

                        {delayInSeconds != null && (
                            <RealTimeIndicator delaySeconds={delayInSeconds} className="-mt-4" />
                        )}
                    </div>

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
