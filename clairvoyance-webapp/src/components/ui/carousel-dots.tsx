import { type Component, For } from "solid-js";
import { cn } from "~/lib/utils";

interface CarouselDotsProps {
    totalSlides: number;
    currentSlide: number;
    onDotClick?: (index: number) => void;
}

const CarouselDots: Component<CarouselDotsProps> = (props) => {
    return (
        <div class="flex justify-center items-center space-x-2 mt-4">
            <For each={Array(props.totalSlides).fill(null)}>
                {(_, index) => (
                    <button
                        class={cn(
                            "w-[6px] h-[6px] rounded-full transition-all duration-300",
                            index() === props.currentSlide
                                ? "bg-muted-foreground scale-110"
                                : "bg-border hover:bg-muted-foreground"
                        )}
                        onClick={() => props.onDotClick?.(index())}
                        aria-label={`Go to slide ${index() + 1}`}
                    />
                )}
            </For>
        </div>
    );
};

export default CarouselDots;
