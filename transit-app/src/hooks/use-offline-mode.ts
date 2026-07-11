import { useLocalStorageState } from "ahooks";

const KEY = "offline-mode-enabled";

export function useOfflineMode() {
    return useLocalStorageState<boolean>(KEY, { defaultValue: false });
}
