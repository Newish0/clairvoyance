import { useTheme } from "@/components/theme-provider";
import { convertCssColorToHex, getCssProperty } from "@/utils/css";
import { useEffect, useState } from "react";

const cssColorVarAsHex = (cssColorVar: string) => convertCssColorToHex(getCssProperty(cssColorVar));

const colorMap = {
    background: "--background",
    foreground: "--foreground",
    muted: "--muted",
    mutedForeground: "--muted-foreground",
};

const getColors = () =>
    Object.fromEntries(
        Object.entries(colorMap).map(([key, cssColorVar]) => [key, cssColorVarAsHex(cssColorVar)])
    ) as Record<keyof typeof colorMap, string>;

export const useThemeColors = () => {
    const { theme } = useTheme();
    const [colors, setColors] = useState<Record<keyof typeof colorMap, string>>(getColors());

    useEffect(() => {
        setColors(getColors());
    }, [theme, setColors]);

    return colors;
};
