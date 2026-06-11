import { useCallback, useEffect, useReducer, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type GeolocationStatus =
    | "idle" // not yet requested (needs user gesture — iOS)
    | "requesting" // user tapped, waiting for browser permission + first fix
    | "watching" // permission granted, watch active
    | "denied" // user or system denied permission
    | "unsupported"; // no API or not HTTPS

type GeolocationState = {
    status: GeolocationStatus;
    position: GeolocationPosition | null;
    error: GeolocationPositionError | null;
};

export type UseGeolocationResult = GeolocationState & {
    /** Call from a user-gesture handler (e.g. button click). No-op if already watching. */
    requestPermission: () => void;
};

// ─── Reducer ─────────────────────────────────────────────────────────────────

type Action =
    | { type: "UNSUPPORTED" }
    | { type: "REQUESTING" }
    | { type: "DENIED" }
    | { type: "POSITION"; payload: GeolocationPosition }
    | { type: "ERROR"; payload: GeolocationPositionError };

function reducer(state: GeolocationState, action: Action): GeolocationState {
    switch (action.type) {
        case "UNSUPPORTED":
            return { status: "unsupported", position: state.position, error: null };
        case "REQUESTING":
            return { status: "requesting", position: state.position, error: null };
        case "DENIED":
            return { status: "denied", position: state.position, error: null };
        case "POSITION":
            return { status: "watching", position: action.payload, error: null };
        case "ERROR":
            return { status: "watching", position: state.position, error: action.payload };
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isSupported(): boolean {
    return (
        typeof navigator !== "undefined" &&
        "geolocation" in navigator &&
        (location.protocol === "https:" || location.hostname === "localhost")
    );
}

const INITIAL_STATE: GeolocationState = {
    status: "idle",
    position: null,
    error: null,
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGeolocation(options: PositionOptions = {}): UseGeolocationResult {
    const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

    const optionsRef = useRef(options);
    optionsRef.current = options;

    const watchIdRef = useRef<number | null>(null);

    const startWatch = useCallback(() => {
        if (watchIdRef.current !== null) return;

        watchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => dispatch({ type: "POSITION", payload: pos }),
            (err) => dispatch({ type: "ERROR", payload: err }),
            optionsRef.current,
        );
    }, []);

    const stopWatch = useCallback(() => {
        if (watchIdRef.current === null) return;
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
    }, []);

    // On mount: probe permission state via Permissions API.
    // - granted   -> auto-watch, no gesture needed
    // - denied    -> set status, don't bother the user
    // - prompt    -> stay idle, wait for requestPermission()
    // - API absent (older Safari) -> stay idle, let requestPermission handle it
    useEffect(() => {
        if (!isSupported()) {
            dispatch({ type: "UNSUPPORTED" });
            return;
        }

        if (!navigator.permissions) return;

        let permissionStatus: PermissionStatus;

        navigator.permissions
            .query({ name: "geolocation" })
            .then((result) => {
                permissionStatus = result;

                if (result.state === "granted") {
                    dispatch({ type: "REQUESTING" });
                    startWatch();
                } else if (result.state === "denied") {
                    dispatch({ type: "DENIED" });
                }

                result.addEventListener("change", handlePermissionChange);
            })
            .catch(() => {
                // Query failed -> stay idle
            });

        function handlePermissionChange(this: PermissionStatus) {
            if (this.state === "granted") {
                dispatch({ type: "REQUESTING" });
                startWatch();
            } else if (this.state === "denied") {
                stopWatch();
                dispatch({ type: "DENIED" });
            }
        }

        return () => {
            stopWatch();
            permissionStatus?.removeEventListener("change", handlePermissionChange);
        };
    }, [startWatch, stopWatch]);

    // Must be called from a user-gesture stack on iOS.
    const requestPermission = useCallback(() => {
        if (!isSupported()) {
            dispatch({ type: "UNSUPPORTED" });
            return;
        }

        if (state.status === "watching" || state.status === "requesting") return;

        dispatch({ type: "REQUESTING" });
        startWatch();
    }, [state.status, startWatch]);

    return { ...state, requestPermission };
}
