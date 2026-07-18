import { differenceInDays, differenceInMinutes, format, type DateArg } from "date-fns";
import { SlidingNumber } from "@/components/ui/countdown";
import { useEffect, useRef, useState } from "react";

interface TripTimeProps {
    datetime: DateArg<Date> | null;
    variant?: "short" | "long";
}

const ONE_HOUR_IN_MINUTES = 60;

export const DepartureTime: React.FC<TripTimeProps> = ({ datetime, variant = "short" }) => {
    if (!datetime) {
        return <span className="text-xs">---</span>;
    }

    const [minutes, setMinutes] = useState(differenceInMinutes(datetime, new Date()));
    const intervalId = useRef<ReturnType<typeof setInterval> | null>(null);
    const departureDays = differenceInDays(datetime, new Date());

    useEffect(() => {
        intervalId.current = setInterval(() => {
            if (!datetime) {
                return;
            }
            setMinutes(differenceInMinutes(datetime, new Date()));
        }, 1000);

        return () => {
            if (intervalId.current) {
                clearInterval(intervalId.current);
            }
        };
    }, [datetime]);

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
            <div className="flex items-center gap-1">
                <span className="text-lg font-bold">
                    <SlidingNumber value={Math.abs(minutes)} direction={"down"} />
                </span>
                <span className="text-xs">min</span>
            </div>
        );
    }

    // Fallback: show formatted time
    if (variant === "short") {
        return (
            <div className="text-nowrap">
                <span className="text-sm font-bold">
                    {format(datetime, "h") + ":" + format(datetime, "mm")}
                </span>
                <span className="text-xs">{format(datetime, "a")} </span>
                {departureDays > 0 && (
                    <sup className="text-muted-foreground font-extrabold">+{departureDays}</sup>
                )}
            </div>
        );
    } else {
        return (
            <div className="text-nowrap">
                <div className="text-xs font-extrabold">{format(datetime, "eee")}</div>
                <span className="text-sm font-bold">
                    {format(datetime, "h") + ":" + format(datetime, "mm")}
                </span>
                <span className="text-xs">{format(datetime, "a")} </span>
            </div>
        );
    }
};
