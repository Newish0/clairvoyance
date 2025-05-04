export const getStopNextTripsByStopId = async (stopId: string) => {
    const response = await fetch(
        `${import.meta.env.PUBLIC_GTFS_API_ENDPOINT}/stops/${stopId}/next-trips`
    );
    return response.json();
};

export const getStopsGeoJson = async (stopIds: string[]) => {
    const queryParams = stopIds.map((stopId) => `stopIds=${stopId}`).join("&");
    const response = await fetch(
        `${import.meta.env.PUBLIC_GTFS_API_ENDPOINT}/stops/geojson?${queryParams}`
    );
    return response.json();
};
