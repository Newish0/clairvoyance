"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { MapPin, Navigation } from "lucide-react";

interface LocationMarkerProps {
    /** Optional heading in degrees (0-360, where 0 is North) */
    heading?: number;
    /** Whether this is the user's current location (shows pulsing ring) */
    isCurrentLocation?: boolean;
    /** Optional label to show below the marker */
    label?: string;
    /** Size variant */
    size?: "sm" | "md" | "lg";
    /** Click handler */
    onClick?: () => void;
    /** Custom className for color styling (e.g., "text-blue-500 border-blue-500") */
    bgColorClassName?: string;
}

export function LocationMarker({
    heading,
    isCurrentLocation = false,
    size = "md",
    onClick,
    bgColorClassName = "",
}: LocationMarkerProps) {
    const sizeClasses = {
        sm: "h-8 w-8",
        md: "h-12 w-12",
        lg: "h-16 w-16",
    };

    const iconSizes = {
        sm: 16,
        md: 24,
        lg: 32,
    };

    const hasHeading = typeof heading === "number";

    return (
        <button
            onClick={onClick}
            className="relative flex flex-col items-center cursor-pointer transition-transform hover:scale-110 active:scale-95"
        >
            {isCurrentLocation && (
                <motion.div
                    className={cn(
                        "absolute rounded-full border-2 opacity-60 border-primary/60",
                        sizeClasses[size]
                    )}
                    initial={{ scale: 1, opacity: 0.6 }}
                    animate={{ scale: 2, opacity: 0 }}
                    transition={{
                        duration: 2,
                        repeat: Number.POSITIVE_INFINITY,
                        ease: "easeOut",
                    }}
                />
            )}

            <motion.div
                className={cn(
                    "bg-primary-foreground/60 backdrop-blur-sm",
                    bgColorClassName,
                    "shadow-xl relative flex items-center justify-center rounded-full border border-primary/20",
                    sizeClasses[size]
                )}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3, ease: [0.4, 0.0, 0.2, 1] }}
            >
                {hasHeading ? (
                    <motion.div
                        className="relative z-10"
                        initial={{ rotate: 0 }}
                        animate={{ rotate: heading }}
                        transition={{ duration: 0.3 }}
                    >
                        <Navigation
                            size={iconSizes[size]}
                            className={cn("drop-shadow-md text-primary")}
                        />
                    </motion.div>
                ) : (
                    <MapPin size={iconSizes[size]} className={cn("drop-shadow-md text-primary")} />
                )}
            </motion.div>
        </button>
    );
}
