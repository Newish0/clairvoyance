import { createEffect, createSignal, onMount, onCleanup } from "solid-js";
import { makePersisted, messageSync } from "@solid-primitives/storage";

export function useTheme() {
    const getSystemTheme = (): "light" | "dark" => {
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    };

    const [theme, _setTheme] = makePersisted(createSignal<"light" | "dark">(getSystemTheme()), {
        storage: localStorage,
        name: "theme",
        serialize: (value) => value,
        deserialize: (value) => value as "light" | "dark",
        sync: messageSync(),
    });

    const [isDark, setIsDark] = createSignal(theme() === "dark");

    // Apply theme to DOM
    createEffect(() => {
        const currentIsDark = theme() === "dark";
        document.documentElement.classList[currentIsDark ? "add" : "remove"]("dark");
        setIsDark(currentIsDark);
    });

    onMount(() => {
        // Listen for system theme changes
        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        const handleSystemThemeChange = () => {
            // Only update if there's no stored preference
            if (!localStorage.getItem("theme")) {
                const systemTheme = getSystemTheme();
                _setTheme(systemTheme);
            }
        };

        mediaQuery.addEventListener("change", handleSystemThemeChange);

        onCleanup(() => {
            mediaQuery.removeEventListener("change", handleSystemThemeChange);
        });
    });

    const setTheme = (theme: "light" | "dark" | "system") => {
        if (theme === "system") {
            _setTheme(getSystemTheme());
        } else {
            _setTheme(theme);
        }
    };

    return [theme, setTheme, isDark] as const;
}
