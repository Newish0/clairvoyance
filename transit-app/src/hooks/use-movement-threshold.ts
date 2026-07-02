import { useLocalStorageState } from "ahooks";

export function useMovementThreshold() {
    return useLocalStorageState("movementThresholdMeters", {
        defaultValue: 50,
    });
}
