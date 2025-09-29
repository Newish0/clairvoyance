// import { differenceInMinutes, differenceInSeconds, formatDistanceToNow } from "date-fns";
// import { Show, type Accessor, type Component } from "solid-js";
// import OccupancyBadge, { OccupancyStatus } from "./occupancy-badge";
// import RealTimeIndicator from "./realtime-indicator";
// import { Card, CardContent } from "./card";
// import { AccessibilityIcon } from "lucide-solid";
// import { Badge } from "./badge";

// type ScheduledTrip = any;

// interface TripVehicleInfoProps {
//     trip: ScheduledTrip;
//     stopId: string;
// }

// // TODO: This components assumes some realtime attributes to always exist when the don't. Must add null checks and conditional rendering

// /**
//  * @param props
//  * @returns
//  */
// const TripVehicleInfo: Component<TripVehicleInfoProps> = (props) => {
//     const ourStopSequence: Accessor<number> = () =>
//         props.trip.scheduled_stop_times.find((st) => st.stop_id === props.stopId)?.stop_sequence;

//     const numStopsAway = () => ourStopSequence()! - props.trip.current_stop_sequence!;

//     const hasLeft = () => numStopsAway() < 0;

//     const predictedDepartureDatetime = () =>
//         props.trip.realtime_stop_updates[ourStopSequence()!]?.predicted_departure_time;

//     const scheduledDepartureDatetime = () =>
//         props.trip.scheduled_stop_times.find((st) => st.stop_id === props.stopId)
//             ?.departure_datetime;

//     const departureMinutes = () =>
//         differenceInMinutes(
//             predictedDepartureDatetime() || scheduledDepartureDatetime(),
//             new Date()
//         );

//     const delaySeconds = (): number | null =>
//         predictedDepartureDatetime()
//             ? differenceInSeconds(predictedDepartureDatetime(), scheduledDepartureDatetime())
//             : null;

//     const etaMsg = () =>
//         hasLeft() ? <>Left {-departureMinutes()} min ago</> : <>{departureMinutes()} min</>;

//     return (
//         <div>
//             <h2 class="text-xl">To {props.trip.trip_headsign}</h2>
//             <h5>
//                 {/* FIXME: Missing stop name from API response */}
//                 At{" "}
//                 {
//                     props.trip.scheduled_stop_times.find((st) => st.stop_id === props.stopId)
//                         ?.stop_name
//                 }
//             </h5>

//             <Show when={hasLeft()} fallback={<h1>{numStopsAway()} stops away</h1>}>
//                 <h1 class="text-2xl font-semibold">{-numStopsAway()} stops down the line</h1>
//             </Show>

//             <div class="relative w-min">
//                 <h1 class="font-black text-1xl leading-none whitespace-nowrap pr-4 py-2">
//                     {etaMsg()}
//                 </h1>
//                 <Show when={delaySeconds() !== null ? delaySeconds() : undefined}>
//                     {(delay) => <RealTimeIndicator delay={delay()} />}
//                 </Show>
//             </div>

//             <div class="grid grid-cols-2 gap-2">
//                 <Card>
//                     <CardContent class="p-4">
//                         <div class="flex flex-col items-center justify-center gap-2 text-center leading-tight">
//                             <OccupancyBadge
//                                 status={
//                                     (props.trip.current_occupancy ??
//                                         OccupancyStatus.NO_DATA_AVAILABLE) as OccupancyStatus
//                                 }
//                                 size={16}
//                             />
//                             <p>{props.trip.current_occupancy}</p>
//                         </div>
//                     </CardContent>
//                 </Card>

//                 <Card>
//                     <CardContent class="p-4">
//                         <div class="flex flex-col items-center justify-center gap-2 text-center leading-tight">
//                             <Badge variant="secondary">
//                                 <AccessibilityIcon size={16} />
//                             </Badge>
//                             <p>Unknown accessibility</p>
//                         </div>
//                     </CardContent>
//                 </Card>
//             </div>

//             <div>
//                 <p>Bus {props.trip.vehicle_id}</p>
//                 <p class="text-sm italic">
//                     Last updated{" "}
//                     {formatDistanceToNow(props.trip.last_realtime_update_timestamp, {
//                         addSuffix: true,
//                         includeSeconds: true,
//                     })}
//                 </p>
//             </div>
//         </div>
//     );
// };

// export default TripVehicleInfo;

import { differenceInMinutes, differenceInSeconds, formatDistanceToNow } from "date-fns";
import { OccupancyStatus } from "gtfs-db-types";
import { AccessibilityIcon, ArrowRight, Bus, Clock, MapPin } from "lucide-solid";
import { Show, createMemo, type Component } from "solid-js";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent } from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";
import { cn } from "~/lib/utils";
import type { ScheduledTripDocumentWithStopName } from "~/services/dtos";

// Occupancy badge component
const OccupancyBadge: Component<{ status: OccupancyStatus; size?: number }> = (props) => {
    const getStatusInfo = () => {
        switch (props.status) {
            case OccupancyStatus.EMPTY:
                return { label: "Empty", color: "bg-green-500" };
            case OccupancyStatus.MANY_SEATS_AVAILABLE:
                return { label: "Many seats", color: "bg-green-400" };
            case OccupancyStatus.FEW_SEATS_AVAILABLE:
                return { label: "Few seats", color: "bg-yellow-400" };
            case OccupancyStatus.STANDING_ROOM_ONLY:
                return { label: "Standing only", color: "bg-orange-400" };
            case OccupancyStatus.CRUSHED_STANDING_ROOM_ONLY:
                return { label: "Crowded", color: "bg-red-400" };
            case OccupancyStatus.FULL:
                return { label: "Full", color: "bg-red-500" };
            case OccupancyStatus.NOT_ACCEPTING_PASSENGERS:
                return { label: "Not accepting", color: "bg-red-600" };
            default:
                return { label: "No data", color: "bg-gray-400" };
        }
    };

    const statusInfo = createMemo(() => getStatusInfo());

    return (
        <div class="flex items-center gap-2">
            <div
                class={cn("rounded-full", statusInfo().color)}
                style={{ width: `${props.size || 16}px`, height: `${props.size || 16}px` }}
            />
            <span class="text-sm font-medium">{statusInfo().label}</span>
        </div>
    );
};

// Realtime indicator component
const RealTimeIndicator: Component<{ delay: number }> = (props) => {
    const isLate = createMemo(() => props.delay > 60);
    const isEarly = createMemo(() => props.delay < -60);
    const isOnTime = createMemo(() => !isLate() && !isEarly());

    const badgeVariant = createMemo(() =>
        isOnTime() ? "success" : isLate() ? "error" : "secondary"
    );

    const delayText = createMemo(() => {
        if (isOnTime()) return "On time";
        if (isLate()) return `${Math.floor(props.delay / 60)} min late`;
        return `${Math.floor(Math.abs(props.delay) / 60)} min early`;
    });

    return (
        <Badge variant={badgeVariant()} class="text-xs">
            {delayText()}
        </Badge>
    );
};

// Main component

interface TripVehicleInfoProps {
    trip: ScheduledTripDocumentWithStopName;
    stopId: string;
}

const TripVehicleInfo: Component<TripVehicleInfoProps> = (props) => {
    // Find our stop in the sequence
    const ourStop = createMemo(() => {
        return props.trip.stop_times.find((st: any) => st.stop_id === props.stopId);
    });

    const ourStopSequence = createMemo(() => ourStop()?.stop_sequence);

    const numStopsAway = createMemo(() => {
        if (ourStopSequence() === undefined || props.trip.current_stop_sequence === undefined) {
            return null;
        }
        return ourStopSequence() - props.trip.current_stop_sequence;
    });

    const hasLeft = createMemo(() => {
        return numStopsAway() !== null && numStopsAway() < 0;
    });

    const predictedDepartureDatetime = createMemo(() => {
        return ourStop()?.predicted_departure_datetime ?? null;
    });

    const scheduledDepartureDatetime = createMemo(() => {
        return ourStop()?.departure_datetime;
    });

    const departureMinutes = createMemo(() => {
        const departureTime = predictedDepartureDatetime() || scheduledDepartureDatetime();
        if (!departureTime) return null;
        return differenceInMinutes(departureTime, new Date());
    });

    const delaySeconds = createMemo(() => {
        if (!predictedDepartureDatetime() || !scheduledDepartureDatetime()) return null;
        return differenceInSeconds(predictedDepartureDatetime(), scheduledDepartureDatetime());
    });

    const etaMsg = createMemo(() => {
        if (departureMinutes() === null) return "Unknown";
        return hasLeft()
            ? `Left ${Math.abs(departureMinutes())} min ago`
            : `${departureMinutes()} min`;
    });

    return (
        <Show when={props.trip && props.stopId} fallback={<div>Loading trip information...</div>}>
            <div class="overflow-hidden">
                <div class="p-4 text-primary">
                    <div class="flex items-center justify-between relative">
                        <div>
                            <h2 class="text-xl font-bold flex items-center gap-2">
                                <ArrowRight class="h-5 w-5" />
                                {props.trip.trip_headsign}
                            </h2>
                            <p class="text-sm flex items-center gap-1 mt-1">
                                <MapPin class="h-4 w-4" />
                                {ourStop()?.stop_name || "Unknown stop"}
                            </p>
                        </div>
                    </div>
                </div>

                <div class="p-6">
                    <div class="grid gap-6">
                        {/* Status information */}
                        <div class="space-y-2">
                            <Show
                                when={numStopsAway() !== null}
                                fallback={<Badge variant="outline">Status unknown</Badge>}
                            >
                                <div class="flex items-center gap-2">
                                    <Badge variant="outline" class="px-2 py-1">
                                        <Show when={hasLeft()} fallback={"Upcoming"}>
                                            Passed
                                        </Show>
                                    </Badge>
                                    <h3 class="text-xl font-semibold">
                                        <Show
                                            when={hasLeft()}
                                            fallback={`${numStopsAway()} stops away`}
                                        >
                                            {Math.abs(numStopsAway()!)} stops down the line
                                        </Show>
                                    </h3>
                                </div>
                            </Show>

                            <div class="flex justify-between items-center mt-2">
                                <div class="flex items-center gap-2">
                                    <Clock class="h-5 w-5 text-muted-foreground" />
                                    <span class="text-2xl font-bold">{etaMsg()}</span>
                                </div>

                                <RealTimeIndicator delay={delaySeconds()!} />
                            </div>
                        </div>

                        <Separator />

                        {/* Vehicle information */}
                        <div class="grid grid-cols-2 gap-4">
                            <Card>
                                <CardContent class="p-4 flex flex-col items-center justify-center gap-2 text-center">
                                    <div class="h-10 flex items-center justify-center">
                                        <OccupancyBadge
                                            status={
                                                (props.trip.current_occupancy ||
                                                    OccupancyStatus.NO_DATA_AVAILABLE) as OccupancyStatus
                                            }
                                            size={16}
                                        />
                                    </div>
                                    <p class="text-sm text-muted-foreground">Current occupancy</p>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardContent class="p-4 flex flex-col items-center justify-center gap-2 text-center">
                                    <div class="h-10 flex items-center justify-center">
                                        <Badge variant="secondary" class="p-1">
                                            <AccessibilityIcon class="h-4 w-4" />
                                        </Badge>
                                    </div>
                                    <p class="text-sm text-muted-foreground">
                                        Unknown accessibility
                                    </p>
                                </CardContent>
                            </Card>
                        </div>

                        <Separator />

                        {/* Vehicle details */}
                        <div class="flex items-center justify-between text-sm">
                            <div class="flex items-center gap-2">
                                <Bus class="h-4 w-4 text-muted-foreground" />
                                <span>Bus {props.trip.vehicle.vehicle_id || "Unknown"}</span>
                            </div>
                            <p class="italic text-muted-foreground text-right">
                                Updated{" "}
                                {formatDistanceToNow(new Date(props.trip.position_updated_at), {
                                    addSuffix: true,
                                    includeSeconds: true,
                                })}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </Show>
    );
};

export default TripVehicleInfo;
