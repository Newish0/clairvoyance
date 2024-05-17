import { cn } from "@/lib/utils";
import React, { useState } from "react";
import { Button } from "./ui/button";

export type Stop = {
    title: string;
    id: string | number;
    time: string;
};

type TimelineProps = {
    stops: Stop[];
    curStopIndex: number;
};

const TimelineElement: React.FC<{
    stop: Stop;
    topColorClass?: `border-${string}`;
    topBorderType?: "solid" | "dotted";
    bottomColorClass?: `border-${string}`;
    bottomBorderType?: "solid" | "dotted";
    circleType?: "ring" | "largeRing" | "solid";
    circleColorClass?: string;
}> = ({
    stop,
    topColorClass,
    topBorderType = "solid",
    bottomColorClass,
    bottomBorderType = "solid",
    circleType = "ring",
    circleColorClass,
}) => {
    return (
        <div className="relative flex flex-row justify-start gap-2">
            <div className="min-w-5 max-w-5 flex-shrink flex flex-col gap-0 flex-grow justify-center items-center">
                {/* Top line */}
                <div
                    className={cn(
                        "flex-grow border-l-4 border-blue-500",
                        topColorClass,
                        `border-${topBorderType}`
                    )}
                ></div>

                {/* ring circle */}
                {circleType === "ring" && (
                    <div
                        className={cn(
                            "w-[8px] h-[8px] ring-2 ring-blue-500 rounded-full",
                            circleColorClass
                        )}
                    ></div>
                )}
                {/* large ring circle */}
                {circleType === "largeRing" && (
                    <div
                        className={cn(
                            "w-[10px] h-[10px] ring-2 ring-blue-500 rounded-full",
                            circleColorClass
                        )}
                    ></div>
                )}

                {/* solid circle */}
                {circleType === "solid" && (
                    <div
                        className={cn(
                            "w-[12px] h-[12px] bg-blue-500 rounded-full",
                            circleColorClass
                        )}
                    ></div>
                )}

                {/* bottom line */}
                <div
                    className={cn(
                        "flex-grow border-l-4 border-blue-500",
                        bottomColorClass,
                        `border-${bottomBorderType}`
                    )}
                ></div>
            </div>
            <div className="relative w-full pt-3 pb-3 flex justify-between">
                <div className="font-medium">{stop?.title}</div>
                <div>{stop?.time}</div>
            </div>
        </div>
    );
};

const TimelineExpand: React.FC<{
    children: React.ReactNode;
    borderColorClass?: `border-${string}`;
}> = ({ borderColorClass, children }) => {
    return (
        <div className="relative flex flex-row justify-start gap-2 mb-1">
            <div className="min-w-5 max-w-5 flex-shrink flex flex-col gap-0 flex-grow justify-center items-center">
                {/*line */}
                <div
                    className={cn(
                        "flex-grow border-l-4 border-dotted border-zinc-400",
                        borderColorClass
                    )}
                ></div>
            </div>
            <div className="relative w-full">{children}</div>
        </div>
    );
};

const TransitTimeline: React.FC<TimelineProps> = ({ stops, curStopIndex }) => {
    const [showAllStops, setShowAllStops] = useState(false);

    const prevStops = showAllStops ? stops.slice(0, curStopIndex) : [stops[curStopIndex - 1]];
    const numPrevStopsExcludingLastStop = curStopIndex - 1;
    const nextStops = stops.slice(curStopIndex);

    return (
        <div className="">
            {numPrevStopsExcludingLastStop > 0 ? (
                <TimelineExpand>
                    <span className="font-normal text-sm text-nowrap ">
                        {numPrevStopsExcludingLastStop} previous stops
                    </span>
                    <Button
                        className=""
                        variant="link"
                        size="sm"
                        onClick={() => setShowAllStops(!showAllStops)}
                    >
                        {showAllStops ? "Show less" : "Show all"}
                    </Button>
                </TimelineExpand>
            ) : null}

            {prevStops.map((stop, index) => (
                <TimelineElement
                    key={stop.id}
                    stop={stop}
                    circleType="ring"
                    topColorClass="border-zinc-400"
                    bottomColorClass="border-zinc-400"
                    circleColorClass="ring-zinc-400"
                />
            ))}

            {nextStops.map((stop, index) => (
                <TimelineElement
                    key={stop.id}
                    stop={stop}
                    circleType={
                        index === 0
                            ? "largeRing"
                            : index === nextStops.length - 1
                            ? "solid"
                            : "ring"
                    }
                    topColorClass={
                        index === 0
                            ? prevStops.length > 0
                                ? "border-zinc-400"
                                : "border-transparent"
                            : undefined
                    }
                    bottomColorClass={
                        index === nextStops.length - 1 ? "border-transparent" : undefined
                    }
                />
            ))}
        </div>
    );
};

export default TransitTimeline;
