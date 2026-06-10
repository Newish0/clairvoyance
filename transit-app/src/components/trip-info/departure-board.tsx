import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import type { inferProcedureOutput } from "@trpc/server";
import { AnimatePresence, motion } from "framer-motion";
import type { AppRouter } from "../../../../transit-api/server/src";
import { DepartureCard } from "./departure-card";
import { differenceInMinutes } from "date-fns";

type DepartureBoardProps = {
    departures: inferProcedureOutput<AppRouter["tripInstance"]["getNearby"]>;
};

export const DepartureBoard: React.FC<DepartureBoardProps> = ({ departures }) => {
    if (!departures.length) return <div className="p-2">No departures</div>;

    const now = new Date();

    const timeMin = Math.min(...departures.map((d) => differenceInMinutes(d.effectiveTime, now)));
    const timeMax = Math.max(...departures.map((d) => differenceInMinutes(d.effectiveTime, now)));
    const distMin = Math.min(...departures.map((d) => d.distanceMeters));
    const distMax = Math.max(...departures.map((d) => d.distanceMeters));

    const grouped = Object.entries(
        departures
            // 50/50 time/distance
            .toSorted((a, b) => {
                const minutesA = differenceInMinutes(a.effectiveTime, now);
                const minutesB = differenceInMinutes(b.effectiveTime, now);

                const timeNormA = (minutesA - timeMin) / (timeMax - timeMin) || 0;
                const timeNormB = (minutesB - timeMin) / (timeMax - timeMin) || 0;
                const distNormA = (a.distanceMeters - distMin) / (distMax - distMin) || 0;
                const distNormB = (b.distanceMeters - distMin) / (distMax - distMin) || 0;

                const scoreA = 0.5 * timeNormA + 0.5 * distNormA;
                const scoreB = 0.5 * timeNormB + 0.5 * distNormB;

                return scoreA - scoreB;
            })
            .reduce<Record<string, (typeof departures)[number][]>>((acc, departure) => {
                const k = departure.routeId + "-" + departure.direction;
                acc[k] = acc[k] || [];
                acc[k].push(departure);
                return acc;
            }, {}),
    );

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
                            {departures.map((departure) => (
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
