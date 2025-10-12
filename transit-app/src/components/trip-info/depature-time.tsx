import { differenceInMinutes, format, type DateArg } from "date-fns";

interface TripTimeProps {
    datetime: DateArg<Date> | null;
    type?: "departure" | "arrival";

    /** If given, use this instead of a negative datetime to determine if the trip has left/arrived */
    hasLeftOrArrived?: boolean;
}

const ONE_HOUR_IN_MINUTES = 60;

export const TripTime: React.FC<TripTimeProps> = (props) => {
    if (!props.datetime) {
        return <span className="text-xs">---</span>;
    }

    const minutes = differenceInMinutes(props.datetime, new Date());
    // const departureDays = differenceInDays(props.datetime, new Date());

    const hasLeftOrArrived = props.hasLeftOrArrived ?? minutes < 0;

    // Render logic based on conditions
    if (hasLeftOrArrived && props.type === "departure") {
        return <span className="text-xs font-bold">Left {Math.abs(minutes)} min ago </span>;
    }

    if (hasLeftOrArrived && props.type === "arrival") {
        return <span className="text-xs font-bold">Arrived {Math.abs(minutes)} min ago </span>;
    }

    // if (minutes === 0) {
    //     return <span className="font-bold">Now</span>;
    // }

    if (minutes < ONE_HOUR_IN_MINUTES) {
        return (
            <>
                <span className="text-lg font-bold">{minutes}</span>
                <span className="text-xs">min</span>
            </>
        );
    }

    // Fallback: show formatted time
    return (
        <>
            <span className="text-sm font-bold text-nowrap">
                {format(props.datetime, "h") + ":" + format(props.datetime, "mm")}
            </span>
            <span className="text-xs">{format(props.datetime, "a")} </span>
            {/* {departureDays > 0 && (
                <sup>+{departureDays}</sup>
            )} */}
        </>
    );
};
