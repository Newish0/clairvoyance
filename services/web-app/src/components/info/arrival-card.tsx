import { type Component, Show } from "solid-js";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-solid";
import RealTimeIndicator from "../ui/realtime-indicator";
import { getArrivalMinutes } from "~/utils/time";
import { differenceInMinutes, differenceInSeconds } from "date-fns";

export interface ArrivalCardProps {
    routeId: string;
    routeShortName: string;
    tripObjectId: string;
    tripHeadsign: string;
    stopId: string;
    stopName: string;
    scheduledArrivalTime: Date;
    predictedArrivalTime?: Date;
}

export const ArrivalCard: Component<ArrivalCardProps> = (props) => {
    const arrivalMinutes = differenceInMinutes(
        props.predictedArrivalTime ?? props.scheduledArrivalTime,
        new Date()
    );
    const delayInSeconds = differenceInSeconds(
        props.predictedArrivalTime,
        props.scheduledArrivalTime
    );

    return (
        <a
            href={`${import.meta.env.BASE_URL}next-trips/?route=${props.routeId}&stop=${
                props.stopId
            }&trip=${props.tripObjectId}`}
        >
            <div class="flex items-center justify-between py-2 border-b last:border-b-0">
                <div class="flex-1">
                    <div class="flex items-center space-x-2 overflow-hidden">
                        <Badge variant="secondary" class="text-sm font-bold">
                            {props.routeShortName}
                        </Badge>
                        <h4 class="text-sm font-semibold text-wrap">{props.tripHeadsign}</h4>
                    </div>
                    <p class="text-xs text-muted-foreground mt-1 truncate">At {props.stopName}</p>
                </div>
                <div class="relative overflow-visible p-2 mr-1">
                    <div class="flex items-center space-x-1">
                        <Clock class="h-3 w-3" />
                        <span class="text-lg font-bold">{arrivalMinutes}</span>
                        <span class="text-xs">min</span>
                    </div>

                    <Show when={delayInSeconds !== 0}>
                        <RealTimeIndicator delay={delayInSeconds} />
                    </Show>

                    <Show when={import.meta.env.DEV && props.predictedArrivalTime}>
                        <code class="text-muted-foreground text-xs">
                            ({props.scheduledArrivalTime.toLocaleTimeString()} →{" "}
                            {props.predictedArrivalTime.toLocaleTimeString()}, Δ {delayInSeconds}s)
                        </code>
                    </Show>
                </div>
            </div>
        </a>
    );
};
