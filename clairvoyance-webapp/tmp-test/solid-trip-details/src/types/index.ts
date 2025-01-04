export type TripDetailsResponse = {
    tripId: string;
    routeId: string;
    stopId: string;
    arrivalTime: string;
    routeShortName: string;
    routeLongName: string;
};

export type RouteDetailsResponse = {
    id: string;
    short_name: string;
    long_name: string;
    // Add other relevant fields as needed
};

export type StopTimeResponse = {
    arrival_time: string;
    stop_id: string;
    trip_id: string;
    // Add other relevant fields as needed
};

export type TripStopResponse = {
    stop_id: string;
    arrival_time: string;
    // Add other relevant fields as needed
};