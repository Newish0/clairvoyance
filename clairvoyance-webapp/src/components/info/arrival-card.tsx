import { type Component } from "solid-js";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-solid";
import { getArrivalMinutes } from "@/utils/time";
import { Show } from "solid-js";
import type { NearbyResponse } from "~/services/gtfs/types";
import RealTimeIndicator from "../ui/realtime-indicator";

interface ArrivalCardProps {
    response: NearbyResponse;
}

export const ArrivalCard: Component<ArrivalCardProps> = (props) => {
    const { route, trip, stop, stop_time } = props.response;
    const arrivalMinutes = getArrivalMinutes(stop_time.arrival_time, stop_time.arrival_delay ?? 0);

    return (
        <a href={`${import.meta.env.BASE_URL}routes/${route.id}/trips/${trip.id}/stops/${stop.id}`}>
            <div class="flex items-center justify-between py-2 border-b last:border-b-0">
                <div class="flex-1">
                    <div class="flex items-center space-x-2 overflow-hidden">
                        <Badge variant="secondary" class="text-sm font-bold">
                            {route.short_name}
                        </Badge>
                        <h4 class="text-sm font-semibold text-wrap">{trip.trip_headsign}</h4>
                    </div>
                    <p class="text-xs text-muted-foreground mt-1 truncate">At {stop.name}</p>
                </div>
                <div class="relative overflow-visible p-2 mr-1">
                    <div class="flex items-center space-x-1">
                        <Clock class="h-3 w-3" />
                        <span class="text-lg font-bold">{arrivalMinutes} </span>
                        <span class="text-xs">min</span>
                    </div>

                    <Show when={stop_time.arrival_delay !== null ? stop_time.arrival_delay : null}>
                        {(delay) => <RealTimeIndicator delay={delay()} />}
                    </Show>

                    <Show when={import.meta.env.DEV}>
                        <code class="text-muted-foreground text-xs">
                            ({stop_time.arrival_time} | {stop_time.arrival_delay})
                        </code>
                    </Show>
                </div>
            </div>
        </a>
    );
};
