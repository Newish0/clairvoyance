import { JSX, mergeProps, onCleanup, onMount, type Component } from "solid-js";
import Lenis from "lenis";

interface LenisProps {
    children?: JSX.Element;
}

// TODO: WIP
const LenisComponent: Component<LenisProps> = (props: LenisProps) => {
    const merged = mergeProps({ children: window }, props);

    let lenis: Lenis;

    onMount(() => {
        lenis = new Lenis({
            autoRaf: true,
        });

        lenis.on("scroll", (e) => {
            console.log(e);
        });
    });

    onCleanup(() => {
        lenis.destroy();
    });

    return null;
};

export default LenisComponent;
