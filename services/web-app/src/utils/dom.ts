/**
 * Finds the nearest parent element (including the body & html element) that has scrollable content
 * @param element - The starting element to search from
 * @returns The nearest scrolling container or null if none found
 */
export function getNearestScrollingContainer(element: Element | null): Element | null {
    if (!element) return null;

    let current = element.parentElement;

    while (current && current !== document.body) {
        const computedStyle = window.getComputedStyle(current);
        const { overflow, overflowX, overflowY } = computedStyle;

        // Check for scrollable overflow styles
        const isScrollable = [overflow, overflowX, overflowY].some(
            (value) => value === "auto" || value === "scroll"
        );

        if (isScrollable) {
            // Verify it actually has scrollable content
            const hasVerticalScroll = current.scrollHeight > current.clientHeight;
            const hasHorizontalScroll = current.scrollWidth > current.clientWidth;

            if (hasVerticalScroll || hasHorizontalScroll) {
                return current;
            }
        }

        current = current.parentElement;
    }

    // Check document.body
    if (
        document.body &&
        (document.body.scrollHeight > document.body.clientHeight ||
            document.body.scrollWidth > document.body.clientWidth)
    ) {
        return document.body;
    }

    // Default to document.documentElement (html element)
    return document.documentElement;
}

export function scrollContainerTo(
    element: Element,
    options: {
        behavior?: ScrollBehavior;
        block: "start" | "center" | "end";
        inline: "start" | "center" | "end";
    }
) {
    const getAlignment = (value: "start" | "center" | "end") => {
        switch (value) {
            case "start":
                return 0;
            case "center":
                return 0.5;
            case "end":
                return 1;
        }
    };

    const scrollingContainer = getNearestScrollingContainer(element);
    const containerBBox = scrollingContainer.getBoundingClientRect();
    const bbox = element.getBoundingClientRect();
    const topOffset = bbox.height * getAlignment(options.block); // Scroll the center of the element
    const scrollTop = bbox.top - containerBBox.top + topOffset;
    const leftOffset = bbox.width * getAlignment(options.inline); // Scroll the center of the element
    const scrollLeft = bbox.left - containerBBox.left + leftOffset;
    scrollingContainer.scrollTo({ top: scrollTop, left: scrollLeft, behavior: options.behavior });
}
