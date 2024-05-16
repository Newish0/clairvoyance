import { cn } from "@/lib/utils";
import React, { useState } from "react";
import { Button } from "./ui/button";

export type Stop = {
    title: string;
    time: string;
};

type TimelineProps = {
    stops: Stop[];
    curStopIndex: number;
};

const TransitTimeline: React.FC<TimelineProps> = ({ stops, curStopIndex }) => {
    const [showAllStops, setShowAllStops] = useState(false);

    const prevStops = showAllStops ? stops.slice(0, curStopIndex) : [stops[curStopIndex - 1]];
    const numPrevStopsExcludingLastStop = curStopIndex - 1;
    const nextStops = stops.slice(curStopIndex);

    return (
        <div className="relative">
            <ul className="space-y-6">
                {numPrevStopsExcludingLastStop > 0 ? (
                    <li className="relative flex gap-5">
                        <div className="relative">
                            <div className="absolute  left-[2px] top-2 border-l-4 border-dotted h-5 border-zinc-400"></div>

                            <div className="absolute left-[2px] top-8 border-l-4 h-9 border-zinc-400" />
                        </div>
                        <div className="relative top-2 flex gap-2 items-center">
                            <h3 className="font-normal text-nowrap">
                                {numPrevStopsExcludingLastStop} previous stops
                            </h3>
                            <Button
                                className="m-0"
                                variant="link"
                                size="sm"
                                onClick={() => setShowAllStops(!showAllStops)}
                            >
                                {showAllStops ? "Show less" : "Show all"}
                            </Button>
                        </div>
                    </li>
                ) : null}

                {prevStops.map(
                    (prevStop, index) =>
                        prevStop && (
                            <li key={index} className="relative flex gap-5">
                                <div className="relative">
                                    <div className="absolute left-[0px] top-2 flex items-center justify-center bg-transparent rounded-full w-[8px] h-[8px] ring-2 ring-zinc-400"></div>

                                    <div className="absolute left-[2px] top-4 border-l-4 h-10 border-zinc-400"></div>
                                </div>
                                <div className="relative flex gap-2 items-center">
                                    <h3 className="font-semibold text-nowrap">{prevStop?.title}</h3>
                                </div>
                            </li>
                        )
                )}

                {nextStops.map((stop, index) => (
                    <li key={index} className="relative flex gap-5">
                        <div className="relative">
                            <div
                                className={cn(
                                    "absolute left-[0px] top-2 flex items-center justify-center bg-transparent rounded-full w-[8px] h-[8px] ring-2 ring-blue-500",
                                    index === stops.length - 1 && "bg-blue-500 ring-2",
                                    index === 0 && "ring-4"
                                )}
                            ></div>
                            {index < nextStops.length - 1 && (
                                <div className="absolute left-[2px] top-4 border-l-4 h-10 border-blue-500"></div>
                            )}
                        </div>
                        <div className="relative w-full">
                            <div className="flex justify-between">
                                <h3 className="font-semibold">{stop.title}</h3>
                                <div className="">{stop.time}</div>
                            </div>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default TransitTimeline;
