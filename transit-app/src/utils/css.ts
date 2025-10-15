import Color from "colorjs.io";

export function getCssProperty(cssVar: string) {
    const root = document.documentElement;
    const value = getComputedStyle(root).getPropertyValue(cssVar).trim();
    return value;
}

export function convertCssColorToHex(cssColor: string) {
    const c = new Color(cssColor);

    const hex = c.srgb_linear
        .map((x) =>
            Math.round(x * 255)
                .toString(16)
                .padStart(2, "0")
        )
        .join("");

    return `#${hex}`;
}
