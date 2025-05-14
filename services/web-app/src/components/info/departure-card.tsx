import { Badge } from "@/components/ui/badge";
import { differenceInMinutes, differenceInSeconds } from "date-fns";
import { Clock } from "lucide-solid";
import { type Component, Show } from "solid-js";
import { recordToSearchParams } from "~/utils/urls";
import RealTimeIndicator from "../ui/realtime-indicator";

export interface DepartureCardKeyProps {
    routeId: string;
    routeShortName: string;
    tripObjectId: string;
    tripHeadsign: string;
    stopId: string;
    stopName: string;
    scheduledDepartureTime: Date;
    predictedDepartureTime?: Date;
}

export interface DepartureCardProps extends DepartureCardKeyProps {
    alt?: {
        routeId: string;
        tripObjectId?: string;
        stopId: string;
    };
}

export const DepartureCard: Component<DepartureCardProps> = (props) => {
    const departureMinutes = differenceInMinutes(
        props.predictedDepartureTime ?? props.scheduledDepartureTime,
        new Date()
    );
    const delayInSeconds = differenceInSeconds(
        props.predictedDepartureTime,
        props.scheduledDepartureTime
    );

    const queryParams = () =>
        recordToSearchParams({
            route: props.routeId,
            stop: props.stopId,
            trip: props.tripObjectId,
            ...(props.alt
                ? {
                      alt_route: props.alt.routeId,
                      alt_stop: props.alt.stopId,
                      ...(props.alt.tripObjectId ? { alt_trip: props.alt.tripObjectId } : {}),
                  }
                : {}),
        });

    return (
        <a href={`${import.meta.env.BASE_URL}next-trips/?${queryParams()}`}>
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
                        <span class="text-lg font-bold">{departureMinutes}</span>
                        <span class="text-xs">min</span>
                    </div>

                    <Show when={delayInSeconds !== 0}>
                        <RealTimeIndicator delay={delayInSeconds} />
                    </Show>

                    <Show when={import.meta.env.DEV && props.predictedDepartureTime}>
                        <code class="text-muted-foreground text-xs">
                            ({props.scheduledDepartureTime.toLocaleTimeString()} →{" "}
                            {props.predictedDepartureTime.toLocaleTimeString()}, Δ {delayInSeconds}
                            s)
                        </code>
                    </Show>
                </div>
            </div>
        </a>
    );
};
