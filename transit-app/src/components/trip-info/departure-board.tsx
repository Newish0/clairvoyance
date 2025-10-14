import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import type { inferProcedureOutput } from "@trpc/server";
import type { AppRouter } from "../../../../transit-api/server/src";
import { DepartureCard } from "./departure-card";

import { StopTimeUpdateScheduleRelationship } from "../../../../gtfs-processor/shared/gtfs-db-types";

type DepartureBoardProps = {
    departures: inferProcedureOutput<AppRouter["tripInstance"]["getNearby"]>;
};

export const DepartureBoard: React.FC<DepartureBoardProps> = (props) => {
    if (!props.departures) return <div>No departures</div>;

    const routes = Object.entries(props.departures);

    return routes.map(([routeId, directionsRecord]) => (
        <Carousel key={routeId}>
            <CarouselContent>
                {Object.entries(directionsRecord).map(([directionId, tripInstances]) => (
                    <CarouselItem key={directionId}>
                        {/* TODO: Limit to the next trip until we figure out an elegant way of showing the next trip after the current */}
                        {tripInstances.slice(0, 1).map((tripInstance) => (
                            <DepartureCard
                                key={tripInstance._id}
                                agencyId={tripInstance.agency_id}
                                routeId={tripInstance.route_id}
                                routeShortName={
                                    tripInstance.route.route_short_name ||
                                    `Route ${tripInstance.route_id}`
                                }
                                routeColor={tripInstance.route.route_color}
                                routeTextColor={tripInstance.route.route_text_color}
                                tripInstanceId={tripInstance._id}
                                tripHeadsign={
                                    tripInstance.trip.trip_headsign || "Trip " + tripInstance._id
                                }
                                stopId={tripInstance.stop_time.stop_id}
                                stopName={tripInstance.stop_time.stop_name}
                                direction={tripInstance.trip.direction_id}
                                scheduledArrivalTime={tripInstance.stop_time.arrival_datetime}
                                predictedArrivalTime={
                                    tripInstance.stop_time.predicted_arrival_datetime
                                }
                                scheduledDepartureTime={tripInstance.stop_time.departure_datetime}
                                predictedDepartureTime={
                                    tripInstance.stop_time.predicted_departure_datetime
                                }
                                isCancelled={
                                    tripInstance.stop_time.schedule_relationship ===
                                    StopTimeUpdateScheduleRelationship.SKIPPED
                                }
                            />
                        ))}
                    </CarouselItem>
                ))}
            </CarouselContent>
        </Carousel>
    ));
};
