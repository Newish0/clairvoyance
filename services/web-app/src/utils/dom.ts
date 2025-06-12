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
