import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light" | "system";

type ThemeProviderProps = {
    children: React.ReactNode;
    defaultTheme?: Theme;
    storageKey?: string;
};

type ThemeProviderState = {
    theme: Theme;
    setTheme: (theme: Theme) => void;
    displayedTheme: Exclude<Theme, "system">;
};

const getSystemTheme = () =>
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

const initialState: ThemeProviderState = {
    theme: "system",
    setTheme: () => null,
    displayedTheme: getSystemTheme(),
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
    children,
    defaultTheme = "system",
    storageKey = "transit-app-ui-theme",
    ...props
}: ThemeProviderProps) {
    const [theme, setTheme] = useState<Theme>(
        () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
    );

    /** The theme that is actually applied to the DOM */
    const [displayedTheme, setDisplayedTheme] = useState<Exclude<Theme, "system">>(() =>
        (localStorage.getItem(storageKey) as Theme) || defaultTheme === "system"
            ? getSystemTheme()
            : defaultTheme
    );

    useEffect(() => {
        const root = window.document.documentElement;

        root.classList.remove("light", "dark");

        if (theme === "system") {
            const systemTheme = getSystemTheme();

            root.classList.add(systemTheme);
            setDisplayedTheme(systemTheme);
            return;
        }

        root.classList.add(theme);
        setDisplayedTheme(theme);
    }, [theme, setDisplayedTheme]);

    const value = {
        theme,
        setTheme: (theme: Theme) => {
            localStorage.setItem(storageKey, theme);
            setTheme(theme);
        },
        displayedTheme,
    };

    return (
        <ThemeProviderContext.Provider {...props} value={value}>
            {children}
        </ThemeProviderContext.Provider>
    );
}

export const useTheme = () => {
    const context = useContext(ThemeProviderContext);

    if (context === undefined) throw new Error("useTheme must be used within a ThemeProvider");

    return context;
};
