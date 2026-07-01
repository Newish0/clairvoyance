import * as React from "react";
import useEmblaCarousel, { type UseEmblaCarouselType } from "embla-carousel-react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type CarouselApi = UseEmblaCarouselType[1];
type UseCarouselParameters = Parameters<typeof useEmblaCarousel>;
type CarouselOptions = UseCarouselParameters[0];
type CarouselPlugin = UseCarouselParameters[1];

type CarouselProps = {
    opts?: CarouselOptions;
    plugins?: CarouselPlugin;
    orientation?: "horizontal" | "vertical";
    setApi?: (api: CarouselApi) => void;
    /**
     * When true, the carousel container height animates to match the
     * currently active slide instead of stretching to the tallest slide.
     */
    autoHeight?: boolean;
};

type CarouselContextProps = {
    carouselRef: ReturnType<typeof useEmblaCarousel>[0];
    api: ReturnType<typeof useEmblaCarousel>[1];
    scrollPrev: () => void;
    scrollNext: () => void;
    canScrollPrev: boolean;
    canScrollNext: boolean;
} & CarouselProps;

const CarouselContext = React.createContext<CarouselContextProps | null>(null);

function useCarousel() {
    const context = React.useContext(CarouselContext);

    if (!context) {
        throw new Error("useCarousel must be used within a <Carousel />");
    }

    return context;
}

function Carousel({
    orientation = "horizontal",
    opts,
    setApi,
    plugins,
    autoHeight = false,
    className,
    children,
    ...props
}: React.ComponentProps<"div"> & CarouselProps) {
    const [carouselRef, api] = useEmblaCarousel(
        {
            ...opts,
            axis: orientation === "horizontal" ? "x" : "y",
        },
        plugins,
    );
    const [canScrollPrev, setCanScrollPrev] = React.useState(false);
    const [canScrollNext, setCanScrollNext] = React.useState(false);

    const onSelect = React.useCallback((api: CarouselApi) => {
        if (!api) return;
        setCanScrollPrev(api.canScrollPrev());
        setCanScrollNext(api.canScrollNext());
    }, []);

    const scrollPrev = React.useCallback(() => {
        api?.scrollPrev();
    }, [api]);

    const scrollNext = React.useCallback(() => {
        api?.scrollNext();
    }, [api]);

    const handleKeyDown = React.useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (event.key === "ArrowLeft") {
                event.preventDefault();
                scrollPrev();
            } else if (event.key === "ArrowRight") {
                event.preventDefault();
                scrollNext();
            }
        },
        [scrollPrev, scrollNext],
    );

    React.useEffect(() => {
        if (!api || !setApi) return;
        setApi(api);
    }, [api, setApi]);

    React.useEffect(() => {
        if (!api) return;
        onSelect(api);
        api.on("reInit", onSelect);
        api.on("select", onSelect);

        return () => {
            api?.off("select", onSelect);
        };
    }, [api, onSelect]);

    return (
        <CarouselContext.Provider
            value={{
                carouselRef,
                api: api,
                opts,
                orientation: orientation || (opts?.axis === "y" ? "vertical" : "horizontal"),
                scrollPrev,
                scrollNext,
                canScrollPrev,
                canScrollNext,
                autoHeight,
            }}
        >
            <div
                onKeyDownCapture={handleKeyDown}
                className={cn("relative", className)}
                role="region"
                aria-roledescription="carousel"
                data-slot="carousel"
                {...props}
            >
                {children}
            </div>
        </CarouselContext.Provider>
    );
}

function CarouselContent({ className, ...props }: React.ComponentProps<"div">) {
    const { carouselRef, orientation, api, autoHeight } = useCarousel();
    const [height, setHeight] = React.useState<number | undefined>(undefined);

    React.useEffect(() => {
        if (!autoHeight || !api) return;

        let resizeObserver: ResizeObserver | null = null;

        const observeActiveSlide = () => {
            const selectedIndex = api.selectedScrollSnap();
            const slideNode = api.slideNodes()[selectedIndex] as HTMLElement | undefined;
            if (!slideNode) return;

            // Re-point the observer at whichever slide is now active.
            resizeObserver?.disconnect();
            resizeObserver = new ResizeObserver((entries) => {
                const entry = entries[0];
                if (!entry) return;
                // offsetHeight (via target) includes padding/border, matching
                // what CarouselItem actually occupies visually.
                setHeight((entry.target as HTMLElement).offsetHeight);
            });
            resizeObserver.observe(slideNode);

            // Set immediately too, so there's no 1-frame flash before the
            // observer's first callback fires.
            setHeight(slideNode.offsetHeight);
        };

        observeActiveSlide();
        api.on("select", observeActiveSlide);
        api.on("reInit", observeActiveSlide);

        return () => {
            api.off("select", observeActiveSlide);
            api.off("reInit", observeActiveSlide);
            resizeObserver?.disconnect();
        };
    }, [api, autoHeight]);

    if (autoHeight) {
        return (
            <motion.div
                ref={carouselRef}
                className="overflow-hidden"
                data-slot="carousel-content"
                animate={{ height: height ?? "auto" }}
                initial={false}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
                <div
                    className={cn(
                        "flex items-start",
                        orientation === "horizontal" ? "-ml-4" : "-mt-4 flex-col",
                        className,
                    )}
                    {...props}
                />
            </motion.div>
        );
    }

    return (
        <div ref={carouselRef} className="overflow-hidden" data-slot="carousel-content">
            <div
                className={cn(
                    "flex",
                    orientation === "horizontal" ? "-ml-4" : "-mt-4 flex-col",
                    className,
                )}
                {...props}
            />
        </div>
    );
}

function CarouselItem({ className, ...props }: React.ComponentProps<"div">) {
    const { orientation } = useCarousel();

    return (
        <div
            role="group"
            aria-roledescription="slide"
            data-slot="carousel-item"
            className={cn(
                "min-w-0 shrink-0 grow-0 basis-full",
                orientation === "horizontal" ? "pl-4" : "pt-4",
                className,
            )}
            {...props}
        />
    );
}

function CarouselPrevious({
    className,
    variant = "outline",
    size = "icon",
    ...props
}: React.ComponentProps<typeof Button>) {
    const { orientation, scrollPrev, canScrollPrev } = useCarousel();

    return (
        <Button
            data-slot="carousel-previous"
            variant={variant}
            size={size}
            className={cn(
                "absolute size-8 rounded-full",
                orientation === "horizontal"
                    ? "top-1/2 -left-12 -translate-y-1/2"
                    : "-top-12 left-1/2 -translate-x-1/2 rotate-90",
                className,
            )}
            disabled={!canScrollPrev}
            onClick={scrollPrev}
            {...props}
        >
            <ArrowLeft />
            <span className="sr-only">Previous slide</span>
        </Button>
    );
}

function CarouselNext({
    className,
    variant = "outline",
    size = "icon",
    ...props
}: React.ComponentProps<typeof Button>) {
    const { orientation, scrollNext, canScrollNext } = useCarousel();

    return (
        <Button
            data-slot="carousel-next"
            variant={variant}
            size={size}
            className={cn(
                "absolute size-8 rounded-full",
                orientation === "horizontal"
                    ? "top-1/2 -right-12 -translate-y-1/2"
                    : "-bottom-12 left-1/2 -translate-x-1/2 rotate-90",
                className,
            )}
            disabled={!canScrollNext}
            onClick={scrollNext}
            {...props}
        >
            <ArrowRight />
            <span className="sr-only">Next slide</span>
        </Button>
    );
}

export {
    type CarouselApi,
    Carousel,
    CarouselContent,
    CarouselItem,
    CarouselPrevious,
    CarouselNext,
};
