// geolocation-provider.tsx
import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";

export type GeolocationStatus = "idle" | "requesting" | "watching" | "denied" | "unsupported";

export type GeolocationState = {
    status: GeolocationStatus;
    position: GeolocationPosition | null;
    error: GeolocationPositionError | null;
    requestPermission: () => void;
    stopWatching: () => void;
};

const GeolocationContext = createContext<GeolocationState | null>(null);

export function GeolocationProvider({
    children,
    options = {},
}: {
    children: React.ReactNode;
    options?: PositionOptions;
}) {
    const [status, setStatus] = useState<GeolocationStatus>("idle");
    const [position, setPosition] = useState<GeolocationPosition | null>(null);
    const [error, setError] = useState<GeolocationPositionError | null>(null);

    const watchIdRef = useRef<number | null>(null);
    const optionsRef = useRef(options);

    const onSuccess = useCallback((pos: GeolocationPosition) => {
        setStatus("watching");
        setPosition(pos);
        setError(null);
    }, []);

    const onError = useCallback((err: GeolocationPositionError) => {
        setError(err);
        setStatus(err.code === 1 ? "denied" : "watching");
    }, []);

    const startWatch = useCallback(() => {
        if (watchIdRef.current !== null) return;
        // getCurrentPosition first -- required on iOS to trigger permission prompt
        // inside a user gesture and get an immediate fix before watch fires
        navigator.geolocation.getCurrentPosition(onSuccess, onError, optionsRef.current);
        watchIdRef.current = navigator.geolocation.watchPosition(
            onSuccess,
            onError,
            optionsRef.current,
        );
    }, [onSuccess, onError]);

    const requestPermission = useCallback(() => {
        if (!("geolocation" in navigator)) {
            setStatus("unsupported");
            return;
        }
        if (status === "watching" || status === "requesting") return;
        setStatus("requesting");
        startWatch();
    }, [status, startWatch]);

    const stopWatching = useCallback(() => {
        if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }
        setPosition(null);
        setError(null);
        setStatus("idle");
    }, []);

    useEffect(() => {
        if (!("geolocation" in navigator)) {
            setStatus("unsupported");
            return;
        }

        // iOS Safari doesn't have navigator.permissions -- stay idle, wait for button
        if (!navigator.permissions) return;

        navigator.permissions.query({ name: "geolocation" }).then((result) => {
            if (result.state === "granted") {
                setStatus("requesting");
                startWatch();
            } else if (result.state === "denied") {
                setStatus("denied");
            }
            // "prompt" -> stay idle

            result.addEventListener("change", function () {
                if (this.state === "granted") {
                    setStatus("requesting");
                    startWatch();
                } else if (this.state === "denied") {
                    if (watchIdRef.current !== null) {
                        navigator.geolocation.clearWatch(watchIdRef.current);
                        watchIdRef.current = null;
                    }
                    setStatus("denied");
                }
            });
        });

        return () => {
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
            }
        };
    }, [startWatch]);

    return (
        <GeolocationContext.Provider value={{ status, position, error, requestPermission, stopWatching }}>
            {children}
        </GeolocationContext.Provider>
    );
}

export function useGeolocation(): GeolocationState {
    const ctx = useContext(GeolocationContext);
    if (!ctx) throw new Error("useGeolocation must be used within GeolocationProvider");
    return ctx;
}
