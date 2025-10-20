import { differenceInMinutes, format, type DateArg } from "date-fns";
import { SlidingNumber } from "../ui/countdown";
import { useEffect, useRef, useState } from "react";

interface TripTimeProps {
    datetime: DateArg<Date> | null;
}

const ONE_HOUR_IN_MINUTES = 60;

export const DepartureTime: React.FC<TripTimeProps> = (props) => {
    if (!props.datetime) {
        return <span className="text-xs">---</span>;
    }

    const [minutes, setMinutes] = useState(differenceInMinutes(props.datetime, new Date()));
    const intervalId = useRef<ReturnType<typeof setInterval> | null>(null);
    // const departureDays = differenceInDays(props.datetime, new Date());

    useEffect(() => {
        intervalId.current = setInterval(() => {
            if (!props.datetime) {
                return;
            }
            setMinutes(differenceInMinutes(props.datetime, new Date()));
        }, 1000);

        return () => {
            if (intervalId.current) {
                clearInterval(intervalId.current);
            }
        };
    }, [props.datetime]);

    if (minutes < 0) {
        return (
            <span className="text-xs font-bold flex items-end text-nowrap gap-1">
                <SlidingNumber value={Math.abs(minutes)} direction={"up"} /> min ago
            </span>
        );
    }

    // if (minutes === 0) {
    //     return <span className="font-bold">Now</span>;
    // }

    if (minutes < ONE_HOUR_IN_MINUTES) {
        return (
            <>
                <span className="text-lg font-bold">
                    <SlidingNumber value={Math.abs(minutes)} direction={"down"} />
                </span>
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
