import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import type { inferProcedureOutput } from "@trpc/server";
import { AnimatePresence, motion } from "framer-motion";
import type { AppRouter } from "transit-api";
import { DepartureCard } from "./departure-card";
import { differenceInMinutes } from "date-fns";

type DepartureBoardProps = {
    departures: inferProcedureOutput<AppRouter["tripInstance"]["getNearbyActive"]>;
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
            .reduce<Record<string, (typeof departures)[number][]>>((acc, departure) => {
                const k = departure.routeId;
                acc[k] = acc[k] || [];
                acc[k].push(departure);
                return acc;
            }, {}),
    ).toSorted(([, a], [, b]) => score(a[0]) - score(b[0]));

    return (
        <AnimatePresence mode="sync">
            {grouped.map(([key, departures]) => (
                <motion.div
                    key={key}
                    layout
                    // initial={{ opacity: 0.5, scale: 0.9 }}
                    // animate={{ opacity: 1, scale: 1 }}
                    // exit={{ opacity: 0.5, scale: 0.9 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                >
                    <Carousel>
                        <CarouselContent>
                            {/* // Assume at most 2 items in route departures: INBOUND and OUTBOUND */}
                            {departures.map((departure, i) => (
                                <CarouselItem key={departure.direction}>
                                    <DepartureCard
                                        agencyId={departure.agencyId}
                                        routeId={departure.routeId}
                                        routeShortName={
                                            departure.routeShortName || `Route ${departure.routeId}`
                                        }
                                        routeColor={departure.routeColor}
                                        routeTextColor={departure.routeTextColor}
                                        tripInstanceId={departure.tripInstanceId}
                                        tripHeadsign={departure.tripHeadsign || "Unknown Trip"}
                                        stopId={departure.stopId}
                                        stopName={departure.stopName || "Unknown Stop"}
                                        direction={departure.direction}
                                        scheduledArrivalTime={departure.scheduledArrivalTime}
                                        predictedArrivalTime={departure.predictedArrivalTime}
                                        scheduledDepartureTime={departure.scheduledDepartureTime}
                                        predictedDepartureTime={departure.predictedDepartureTime}
                                        isSkipped={departure.scheduleRelationship === "SKIPPED"}
                                        isLastTripOfDay={departure.isLast}
                                        oppositeStopId={departures.at(-i - 1)?.stopId} // Stop id of the opposite direction
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
