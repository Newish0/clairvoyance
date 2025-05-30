/**
 * Abstracts away different variables based execution environment (i.e. client or server).
 * Provides a sort of type safe way to access environment variables.
 */

const EndpointEnv = {
    get GTFS_API_ENDPOINT() {
        return import.meta.env.GTFS_API_ENDPOINT || import.meta.env.PUBLIC_GTFS_API_ENDPOINT;
    },
} as const;

export default EndpointEnv;
