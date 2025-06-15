import { differenceInMinutes, format, type DateArg } from "date-fns";
import { Match, Switch, type Component } from "solid-js";

interface TripTimeProps {
    datetime: DateArg<Date>;
    type?: "departure" | "arrival";

    /** If given, use this instead of a negative datetime to determine if the trip has left/arrived */
    hasLeftOrArrived?: boolean;
}

const ONE_HOUR_IN_MINUTES = 60;

const TripTime: Component<TripTimeProps> = (props) => {
    const minutes = () => differenceInMinutes(props.datetime, new Date());
    // const departureDays = () => differenceInDays(props.departureTime, new Date());

    const hasLeftOrArrived = () => props.hasLeftOrArrived ?? minutes() < 0;

    return (
        <Switch
            fallback={
                <>
                    <span class="text-sm font-bold text-nowrap">
                        {format(props.datetime, "h") + ":" + format(props.datetime, "mm")}
                    </span>
                    <span class="text-xs">{format(props.datetime, "a")} </span>
                    {/* <Show when={departureDays() > 0}>
                        <sup>+{departureDays()}</sup>
                    </Show> */}
                </>
            }
        >
            <Match when={hasLeftOrArrived() && props.type === "departure"}>
                <span class="text-xs font-bold">Left {Math.abs(minutes())} min ago </span>
            </Match>
            <Match when={hasLeftOrArrived() && props.type === "arrival"}>
                <span class="text-xs font-bold">Arrived {Math.abs(minutes())} min ago </span>
            </Match>
            {/* <Match when={departureMinutes() === 0}>
                <span class="font-bold">Now</span>
            </Match> */}
            <Match when={minutes() < ONE_HOUR_IN_MINUTES}>
                <span class="text-lg font-bold">{minutes()}</span>
                <span class="text-xs">min</span>
            </Match>
        </Switch>
    );
};

export default TripTime;
