import { useIsMobile } from "@/hooks/use-mobile";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
    const { theme = "system" } = useTheme();
    const isMobile = useIsMobile();

    return (
        <Sonner
            theme={theme as ToasterProps["theme"]}
            className="toaster group"
            style={
                {
                    "--normal-bg": "color-mix(in srgb, var(--popover), transparent 70%)",
                    "--normal-text": "var(--popover-foreground)",
                    "--normal-border": "var(--border)",
                } as React.CSSProperties
            }
            toastOptions={{
                className: "backdrop-blur-md",
            }}
            position={isMobile ? "top-center" : "bottom-right"}
            {...props}
        />
    );
};

export { Toaster };
