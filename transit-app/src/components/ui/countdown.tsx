import { AnimatePresence, motion } from "framer-motion";

type Direction = "up" | "down";

interface SlidingDigitProps {
    digit: string;
    direction: Direction;
    className?: string;
}

export function SlidingDigit({ digit, direction, className = "" }: SlidingDigitProps) {
    return (
        <div className={className}>
            <AnimatePresence mode="popLayout">
                <motion.div
                    key={digit}
                    initial={{ y: direction === "up" ? 100 : -100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: direction === "up" ? -100 : 100, opacity: 0 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                >
                    {digit}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}

interface SlidingNumberProps {
    value: number;
    direction: Direction;
    digitClassName?: string;
    containerClassName?: string;
    startPadding?: number;
}

export function SlidingNumber({
    value,
    direction,
    digitClassName,
    containerClassName = "flex relative",
    startPadding = 0,
}: SlidingNumberProps) {
    const digits = String(value).padStart(startPadding, "0").split("");

    return (
        <div className={containerClassName}>
            {digits.map((digit, index) => (
                <SlidingDigit
                    key={index}
                    digit={digit}
                    direction={direction}
                    className={digitClassName}
                />
            ))}
        </div>
    );
}
