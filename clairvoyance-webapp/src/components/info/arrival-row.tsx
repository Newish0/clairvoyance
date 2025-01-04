import { type Component, createEffect, createSignal, For } from "solid-js";
import { Card, CardContent } from "@/components/ui/card";
import {
    Carousel,
    CarouselContent,
    CarouselItem,
    type CarouselApi,
} from "@/components/ui/carousel";
import { ArrivalCard } from "./arrival-card";
import type { NearbyResponse } from "~/services/gtfs/types";
import CarouselDots from "../ui/carousel-dots";

interface ArrivalRowProps {
    entries: NearbyResponse[];
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
        <div class="border-b last:border-b-0">
            <Carousel class="w-full" setApi={setApi}>
                <CarouselContent>
                    <For each={props.entries}>
                        {(response) => (
                            <CarouselItem>
                                <ArrivalCard response={response} />
                            </CarouselItem>
                        )}
                    </For>
                </CarouselContent>
            </Carousel>

            <div class="py-2 text-center text-sm text-muted-foreground">
                <CarouselDots currentSlide={current()} totalSlides={count()} />
            </div>
        </div>
    );
};
