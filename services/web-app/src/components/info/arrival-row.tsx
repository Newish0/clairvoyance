import {
    Carousel,
    CarouselContent,
    CarouselItem,
    type CarouselApi,
} from "@/components/ui/carousel";
import { createEffect, createSignal, For, type Component } from "solid-js";
import CarouselDots from "../ui/carousel-dots";
import { ArrivalCard, type ArrivalCardProps } from "./arrival-card";

interface ArrivalRowProps {
    entries: ArrivalCardProps[];
}

export const ArrivalRow: Component<ArrivalRowProps> = (props) => {
    const [api, setApi] = createSignal<ReturnType<CarouselApi>>();
    const [current, setCurrent] = createSignal(0);
    const [count, setCount] = createSignal(0);

    const onSelect = () => {
        setCurrent(api()!.selectedScrollSnap());
    };

    createEffect(() => {
        if (!api()) {
            return;
        }

        setCount(api()!.scrollSnapList().length);
        setCurrent(api()!.selectedScrollSnap());

        api()!.on("select", onSelect);
    });

    return (
        <div class="border-b pb-2 last:pb-0 last:border-b-0">
            <Carousel class="w-full" setApi={setApi}>
                <CarouselContent>
                    <For each={props.entries}>
                        {(cardProps) => (
                            <CarouselItem>
                                <ArrivalCard {...cardProps} />
                            </CarouselItem>
                        )}
                    </For>
                </CarouselContent>
            </Carousel>

            <div class="text-center text-sm text-muted-foreground">
                <CarouselDots currentSlide={current()} totalSlides={count()} />
            </div>
        </div>
    );
};
