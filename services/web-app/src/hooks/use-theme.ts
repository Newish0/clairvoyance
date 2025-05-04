import { createEffect, createMemo, createSignal } from "solid-js";

export function useTheme() {
    const [theme, setTheme] = createSignal<"light" | "dark" | "system">("light");

    const isDarkMode = document.documentElement.classList.contains("dark");
    setTheme(isDarkMode ? "dark" : "light");

    const isDark = createMemo(() => {
        return (
            theme() === "dark" ||
            (theme() === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
        );
    });

    createEffect(() => {
        document.documentElement.classList[isDark() ? "add" : "remove"]("dark");
    });

    return [theme, setTheme, isDark] as const;
}
