import { createSignal, onMount, onCleanup, type Accessor } from "solid-js";

/**
 * A hook that tracks the state of a CSS media query
 * @param query - The media query string (e.g., "(max-width: 768px)")
 * @returns An accessor that returns true if the media query matches
 */
export function useMediaQuery(query: string): Accessor<boolean> {
    const [matches, setMatches] = createSignal(false);

    onMount(() => {
        const mediaQuery = window.matchMedia(query);

        // Set initial value
        setMatches(mediaQuery.matches);

        // Create event handler
        const handleChange = (e: MediaQueryListEvent) => {
            setMatches(e.matches);
        };

        // Add listener
        mediaQuery.addEventListener("change", handleChange);

        // Cleanup
        onCleanup(() => {
            mediaQuery.removeEventListener("change", handleChange);
        });
    });

    return matches;
}

/**
 * Configuration for mobile breakpoint
 */
const MOBILE_BREAKPOINT = 768;

/**
 * A hook that determines if the current viewport is mobile-sized
 * @param breakpoint - Custom breakpoint in pixels (default: 768)
 * @returns An accessor that returns true if the viewport is mobile-sized
 */
export function useIsMobile(breakpoint: number = MOBILE_BREAKPOINT): Accessor<boolean> {
    return useMediaQuery(`(max-width: ${breakpoint - 1}px)`);
}

/**
 * Additional utility hooks for common breakpoints
 */

export function useIsTablet(): Accessor<boolean> {
    return useMediaQuery("(min-width: 768px) and (max-width: 1023px)");
}

export function useIsDesktop(): Accessor<boolean> {
    return useMediaQuery("(min-width: 1024px)");
}

export function useIsLargeDesktop(): Accessor<boolean> {
    return useMediaQuery("(min-width: 1280px)");
}

/**
 * Hook for detecting dark mode preference
 */
export function usePrefersDarkMode(): Accessor<boolean> {
    return useMediaQuery("(prefers-color-scheme: dark)");
}

/**
 * Hook for detecting reduced motion preference
 */
export function useReducedMotion(): Accessor<boolean> {
    return useMediaQuery("(prefers-reduced-motion: reduce)");
}
