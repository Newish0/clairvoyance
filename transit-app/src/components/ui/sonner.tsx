import { useIsMobile } from "@/hooks/use-mobile";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
    const { theme = "system" } = useTheme();

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
            {...props}
        />
    );
};

const ResponsiveToaster = ({
    position,
    ...props
}: Omit<ToasterProps, "position"> & {
    position: {
        mobile: ToasterProps["position"];
        desktop: ToasterProps["position"];
    };
}) => {
    const isMobile = useIsMobile();

    const responsivePosition = isMobile ? position.mobile : position.desktop;

    return <Toaster {...props} position={responsivePosition} />;
};

export { Toaster, ResponsiveToaster };
