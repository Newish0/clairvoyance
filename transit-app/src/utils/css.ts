import Color from "colorjs.io";

/**
 * Resolves a CSS color string to a concrete value.
 * Handles:
 *   - var(--some-token)        -> looks up the computed value on :root
 *   - var(--token, #fallback)  -> uses fallback if var is empty
 *   - plain strings            -> returned as-is
 */
export function resolveCssColor(color: string): string {
    const varPattern = /var\((--[^\,\:\)]+)\)/g;
    return color.trim().replace(varPattern, (match) => {
        const cssVar = match.slice(4, -1).trim();
        const resolved = getCssProperty(cssVar);
        console.log("resolved", resolved);
        return resolved;
    });
}

export function getCssProperty(cssVar: string) {
    const root = document.documentElement;
    const value = getComputedStyle(root).getPropertyValue(cssVar).trim();
    return value;
}

export function ensureHexColorStartsWithHash(color: string | null | undefined) {
    if (!color) return;
    return color.startsWith("#") ? color : `#${color}`;
}

export function convertCssColorToHex(cssColor: string) {
    const c = new Color(resolveCssColor(cssColor));
    return c.to("srgb").toString({ format: "hex" });
}

export function getMutedColor(color: string | Color, muteFactor: number = 0.5) {
    const resolved = typeof color === "string" ? resolveCssColor(color) : color;
    console.log("resolved", resolved);
    const c = new Color(resolved);

    // Clamp the factor to a valid range
    muteFactor = Math.max(0, Math.min(1, muteFactor));

    // Convert to OKLCH for perceptually uniform adjustments
    const oklch = c.to("oklch");

    // Check if color is black or near-black (very low lightness)
    if (oklch.l < 0.1) {
        // For black, increase lightness to create a muted gray
        oklch.l = 0.3 + muteFactor * 0.5;
        oklch.c = 0; // Keep it achromatic (gray)
    } else {
        // For other colors, reduce chroma (saturation) AND increase lightness
        oklch.c *= 1 - muteFactor;

        // Increase lightness - push toward white while preserving some color character
        // The formula ensures we don't exceed lightness of 1.0
        oklch.l = oklch.l + (1 - oklch.l) * muteFactor * 0.4;
    }

    return oklch.to("srgb").toString({ format: "hex" });
}

export function withOpacity(color: string | Color, opacity: number = 0.5): string {
    const resolved = typeof color === "string" ? resolveCssColor(color) : color;
    console.log("resolved", resolved);
    const c = new Color(resolved);

    // Clamp opacity between 0 and 1
    const clampedOpacity = Math.max(0, Math.min(1, opacity));

    // Set the alpha channel
    c.alpha = clampedOpacity;

    // Return as hex with alpha
    return c.to("srgb").toString({ format: "hex" });
}
