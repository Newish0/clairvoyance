import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import { differenceInMinutes } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { DeparturesCard } from "./departures-card";
import type { Departure } from "./types";

type DepartureBoardProps = {
    departures: Departure[];
};

export const DepartureBoard: React.FC<DepartureBoardProps> = ({ departures }) => {
    if (!departures.length) return <div className="p-2">No departures</div>;

    const now = new Date();

    const timeMin = Math.min(
        ...departures
            .filter((d) => d.effectiveTime)
            .map((d) => differenceInMinutes(d.effectiveTime!, now)),
    );
    const timeMax = Math.max(
        ...departures
            .filter((d) => d.effectiveTime)
            .map((d) => differenceInMinutes(d.effectiveTime!, now)),
    );
    const distMin = Math.min(...departures.map((d) => d.distanceMeters));
    const distMax = Math.max(...departures.map((d) => d.distanceMeters));

    // 50/50 time/distance
    const score = (d: (typeof departures)[number]) => {
        const minutes = d.effectiveTime ? differenceInMinutes(d.effectiveTime, now) : 0;
        const timeNorm = (minutes - timeMin) / (timeMax - timeMin) || 0;
        const distNorm = (d.distanceMeters - distMin) / (distMax - distMin) || 0;

        return 0.5 * timeNorm + 0.5 * distNorm;
    };

    const grouped = Object.entries(
        departures
            .toSorted((a, b) => score(a) - score(b))
            .reduce<Record<string, Record<string, Departure[]>>>((acc, departure) => {
                const routeId = departure.routeId;
                const direction = departure.direction || "OUTBOUND";
                acc[routeId] = acc[routeId] || {};
                acc[routeId][direction] = acc[routeId][direction] || [];

                // Only include departures of difference trip headsign if less than 1 hours apart
                if (
                    !acc[routeId][direction].length ||
                    (departure.effectiveTime &&
                        differenceInMinutes(departure.effectiveTime, new Date()) < 60)
                )
                    acc[routeId][direction].push(departure);
                return acc;
            }, {}),
    ).toSorted(
        ([, a], [, b]) => score(Object.values(a).flat()[0]) - score(Object.values(b).flat()[0]),
    );

    return (
        <AnimatePresence mode="sync">
            {grouped.map(([key, depsByDir]) => (
                <motion.div
                    key={key}
                    layout
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                >
                    <Carousel autoHeight>
                        <CarouselContent>
                            {Object.entries(depsByDir).map(([direction, departures], i) => (
                                <CarouselItem key={direction}>
                                    <DeparturesCard
                                        departures={departures}
                                        oppositeStopId={
                                            Object.values(depsByDir).at(-i - 1)?.[0]?.stopId
                                        } // Stop id of the opposite direction
                                    />
                                </CarouselItem>
                            ))}
                        </CarouselContent>
                    </Carousel>
                </motion.div>
            ))}
        </AnimatePresence>
    );
};
