import { addDays, endOfDay, format, startOfDay } from "date-fns";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-solid";
import { createResource, createSignal, Show, type Component } from "solid-js";
import { getRouteNextTripsAtStop } from "~/services/trips";
import { Button } from "../ui/button";
import { DayPicker } from "../ui/day-picker";
import type { DepartureItem } from "../ui/simple-departure-schedule";
import SimpleDepartureSchedule from "../ui/simple-departure-schedule";

interface RouteStopScheduleProps {
    routeId: string;
    stopId: string;
    directionId: string;
    curViewingTrip?: any;
}

const RouteStopSchedule: Component<RouteStopScheduleProps> = (props) => {
    const [curViewingDate, setCurViewingDate] = createSignal(new Date());

    const [curDayTrips] = createResource(
        () => ({
            routeId: props.routeId,
            directionId: props.directionId,
            stopId: props.stopId,
            curViewingDate: curViewingDate(),
        }),
        ({ routeId, directionId, stopId, curViewingDate }) =>
            getRouteNextTripsAtStop({
                directionId: directionId as "0" | "1",
                routeId: routeId,
                stopId: stopId,
                startDatetime: startOfDay(curViewingDate),
                endDatetime: endOfDay(curViewingDate),
                limit: 10000, // Basically infinite
            })
    );

    const handleDateChange = (date: Date) => {
        setCurViewingDate(date);
    };

    const groupedDepartures: () => DepartureItem[][] = () => {
        if (!curDayTrips()) return [];

        const groupedByTheHour: Record<string, DepartureItem[]> = {};

        for (const trip of curDayTrips()) {
            const staticStopTime = trip.scheduled_stop_times.find(
                (s) => s.stop_id === props.stopId
            );
            const realtimeStopUpdates = staticStopTime
                ? trip.realtime_stop_updates[staticStopTime?.stop_sequence]
                : undefined;

            const arrivalDatetime: string = realtimeStopUpdates
                ? realtimeStopUpdates.predicted_arrival_time
                : staticStopTime?.arrival_datetime;

            const tripHeadsign = trip.trip_headsign;

            const hours = new Date(arrivalDatetime).getHours();

            groupedByTheHour[hours] = groupedByTheHour[hours] || [];
            groupedByTheHour[hours].push({
                id: trip._id,
                headsign: tripHeadsign,
                time: format(arrivalDatetime, "p"),
                isRealtime: realtimeStopUpdates !== undefined,
                href: `${import.meta.env.BASE_URL}next-trips/?route=${trip.route_id}&stop=${
                    props.stopId
                }&trip=${trip._id}`,
            });
        }

        return Object.values(groupedByTheHour);
    };

    return (
        <>
            <div class="top-0 sticky mb-2 bg-background flex justify-center items-center gap-1 w-full">
                <Button
                    variant="secondary"
                    onClick={() => setCurViewingDate(addDays(curViewingDate(), -1))}
                >
                    <ChevronLeftIcon />
                </Button>
                <DayPicker
                    date={curViewingDate()}
                    onDateChange={handleDateChange}
                    futureOnly={true}
                />
                <Button
                    variant="secondary"
                    onClick={() => setCurViewingDate(addDays(curViewingDate(), 1))}
                >
                    <ChevronRightIcon />
                </Button>
            </div>

            <SimpleDepartureSchedule
                scheduleData={groupedDepartures()}
                defaultSelected={{ id: props.curViewingTrip._id }}
            />

            <Show when={groupedDepartures()?.length === 0}>
                <p class="text-center my-4 text-muted-foreground">No more departures</p>
            </Show>
        </>
    );
};

export default RouteStopSchedule;
