interface CustomZoomOptions {
    /** The anchor point for zoom operations. Can be screen coordinates [x, y] or 'center' */
    anchor?: [number, number] | "center";
    /** Whether to enable custom wheel zoom (default: true) */
    enableWheelZoom?: boolean;
    /** Whether to enable custom touch zoom (default: true) */
    enableTouchZoom?: boolean;
    /** Animation duration for wheel zoom in milliseconds (default: 300) */
    wheelAnimationDuration?: number;
    /** Wheel zoom sensitivity multiplier (default: 1) */
    wheelSensitivity?: number;
    /** Touch zoom sensitivity multiplier (default: 1) */
    touchSensitivity?: number;
    /** Minimum zoom level (default: 0) */
    minZoom?: number;
    /** Maximum zoom level (default: 22) */
    maxZoom?: number;
    /** Threshold for minimum zoom delta to prevent tiny updates (default: 0.01) */
    zoomThreshold?: number;
}

class CustomZoomController {
    private map: maplibregl.Map;
    private options: Required<CustomZoomOptions>;
    private isZooming = false;
    private initialDistance = 0;
    private initialZoom = 0;
    private touchAnchorPoint: [number, number] | null = null; // Store touch midpoint
    private wheelHandler?: (e: WheelEvent) => void;
    private touchHandlers: {
        touchstart?: (e: TouchEvent) => void;
        touchmove?: (e: TouchEvent) => void;
        touchend?: (e: TouchEvent) => void;
    } = {};

    constructor(map: maplibregl.Map, options: CustomZoomOptions = {}) {
        this.map = map;
        this.options = {
            anchor: options.anchor || "center",
            enableWheelZoom: options.enableWheelZoom ?? true,
            enableTouchZoom: options.enableTouchZoom ?? true,
            wheelAnimationDuration: options.wheelAnimationDuration ?? 300,
            wheelSensitivity: options.wheelSensitivity ?? 1,
            touchSensitivity: options.touchSensitivity ?? 1,
            minZoom: options.minZoom ?? 0,
            maxZoom: options.maxZoom ?? 22,
            zoomThreshold: options.zoomThreshold ?? 0.01,
        };

        this.enable();
    }

    private getAnchorPoint(forTouch = false): [number, number] {
        if (this.options.anchor === "center") {
            // For touch zoom, use the midpoint between fingers if available
            if (forTouch && this.touchAnchorPoint) {
                return this.touchAnchorPoint;
            }
            // Default to canvas center
            return [this.map.getCanvas().width / 2, this.map.getCanvas().height / 2];
        }
        return this.options.anchor;
    }

    private calculateTouchMidpoint(touch1: Touch, touch2: Touch): [number, number] {
        const canvas = this.map.getCanvas();
        const rect = canvas.getBoundingClientRect();
        const x = ((touch1.clientX + touch2.clientX) / 2 - rect.left) * (canvas.width / rect.width);
        const y =
            ((touch1.clientY + touch2.clientY) / 2 - rect.top) * (canvas.height / rect.height);
        return [x, y];
    }

    private zoomAroundAnchor(targetZoom: number, animated = true, forTouch = false) {
        const currentZoom = this.map.getZoom();
        const zoomDelta = targetZoom - currentZoom;

        if (Math.abs(zoomDelta) < this.options.zoomThreshold) return;

        // Clamp zoom to min/max
        const clampedZoom = Math.max(
            this.options.minZoom,
            Math.min(this.options.maxZoom, targetZoom)
        );

        // Get current center and anchor point
        const currentCenter = this.map.getCenter();
        const currentCenterPixel = this.map.project(currentCenter);
        const anchorPoint = this.getAnchorPoint(forTouch);

        // Calculate offset from center to anchor
        const dx = anchorPoint[0] - currentCenterPixel.x;
        const dy = anchorPoint[1] - currentCenterPixel.y;

        // Calculate how much the anchor will move due to zoom
        const actualZoomDelta = clampedZoom - currentZoom;
        const scale = Math.pow(2, actualZoomDelta);
        const newDx = dx * scale;
        const newDy = dy * scale;

        // Calculate new center to keep anchor stationary
        const newCenterPixel: [number, number] = [
            currentCenterPixel.x + (newDx - dx),
            currentCenterPixel.y + (newDy - dy),
        ];

        const newCenter = this.map.unproject(newCenterPixel);

        if (animated) {
            this.map.easeTo({
                center: newCenter,
                zoom: clampedZoom,
                duration: this.options.wheelAnimationDuration,
            });
        } else {
            this.map.jumpTo({
                center: newCenter,
                zoom: clampedZoom,
            });
        }
    }

    private setupWheelHandler() {
        if (!this.options.enableWheelZoom) return;

        this.wheelHandler = (e: WheelEvent) => {
            e.preventDefault();

            const canvas = this.map.getCanvas();
            const delta =
                (e.deltaY / -(canvas.clientHeight / 5) + e.deltaX / -(canvas.clientWidth / 5)) *
                this.options.wheelSensitivity;

            const currentZoom = this.map.getZoom();
            const newZoom = currentZoom + delta;

            this.zoomAroundAnchor(newZoom, true, false);
        };

        this.map.getCanvasContainer().addEventListener("wheel", this.wheelHandler);
    }

    private setupTouchHandlers() {
        if (!this.options.enableTouchZoom) return;

        this.touchHandlers.touchstart = (e: TouchEvent) => {
            if (e.touches.length === 2) {
                e.preventDefault();
                this.isZooming = true;
                this.initialZoom = this.map.getZoom();

                const touch1 = e.touches[0];
                const touch2 = e.touches[1];

                // Calculate and store the midpoint for center mode
                if (this.options.anchor === "center") {
                    this.touchAnchorPoint = this.calculateTouchMidpoint(touch1, touch2);
                }

                this.initialDistance = Math.sqrt(
                    Math.pow(touch2.clientX - touch1.clientX, 2) +
                        Math.pow(touch2.clientY - touch1.clientY, 2)
                );
            }
        };

        this.touchHandlers.touchmove = (e: TouchEvent) => {
            if (e.touches.length === 2 && this.isZooming) {
                e.preventDefault();

                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                const currentDistance = Math.sqrt(
                    Math.pow(touch2.clientX - touch1.clientX, 2) +
                        Math.pow(touch2.clientY - touch1.clientY, 2)
                );

                // Update touch anchor point if in center mode
                if (this.options.anchor === "center") {
                    this.touchAnchorPoint = this.calculateTouchMidpoint(touch1, touch2);
                }

                // Calculate zoom delta based on pinch distance
                const scale = currentDistance / this.initialDistance;
                const zoomDelta = Math.log2(scale) * this.options.touchSensitivity;
                const newZoom = this.initialZoom + zoomDelta;

                this.zoomAroundAnchor(newZoom, false, true);
            }
        };

        this.touchHandlers.touchend = (e: TouchEvent) => {
            if (e.touches.length < 2) {
                this.isZooming = false;
                this.touchAnchorPoint = null; // Clear touch anchor
            }
        };

        const container = this.map.getCanvasContainer();
        container.addEventListener("touchstart", this.touchHandlers.touchstart, { passive: false });
        container.addEventListener("touchmove", this.touchHandlers.touchmove, { passive: false });
        container.addEventListener("touchend", this.touchHandlers.touchend);
    }

    /**
     * Enable the custom zoom controller
     */
    enable() {
        // Disable default zoom behaviors
        this.map.scrollZoom.disable();
        this.map.touchZoomRotate.disable();

        // Setup custom handlers
        this.setupWheelHandler();
        this.setupTouchHandlers();
    }

    /**
     * Disable the custom zoom controller and restore default behavior
     */
    disable() {
        // Remove custom handlers
        if (this.wheelHandler) {
            this.map.getCanvasContainer().removeEventListener("wheel", this.wheelHandler);
        }

        const container = this.map.getCanvasContainer();
        if (this.touchHandlers.touchstart) {
            container.removeEventListener("touchstart", this.touchHandlers.touchstart);
        }
        if (this.touchHandlers.touchmove) {
            container.removeEventListener("touchmove", this.touchHandlers.touchmove);
        }
        if (this.touchHandlers.touchend) {
            container.removeEventListener("touchend", this.touchHandlers.touchend);
        }

        // Re-enable default behaviors
        this.map.scrollZoom.enable();
        this.map.touchZoomRotate.enable();
    }

    /**
     * Update the anchor point
     */
    setAnchor(anchor: [number, number] | "center") {
        this.options.anchor = anchor;
    }

    /**
     * Get the current anchor point
     */
    getAnchor(): [number, number] | "center" {
        return this.options.anchor;
    }

    /**
     * Programmatically zoom to a level around the anchor
     */
    zoomTo(zoom: number, animated = true) {
        this.zoomAroundAnchor(zoom, animated, false);
    }

    /**
     * Programmatically zoom by a delta around the anchor
     */
    zoomBy(delta: number, animated = true) {
        const currentZoom = this.map.getZoom();
        this.zoomAroundAnchor(currentZoom + delta, animated, false);
    }

    /**
     * Update controller options
     */
    updateOptions(options: Partial<CustomZoomOptions>) {
        Object.assign(this.options, options);
    }

    /**
     * Destroy the controller and clean up
     */
    destroy() {
        this.disable();
    }
}

/**
 * Create a custom zoom controller for a MapLibre map
 * @param map - The MapLibre map instance
 * @param options - Configuration options
 * @returns CustomZoomController instance
 */
export function createCustomZoomController(
    map: maplibregl.Map,
    options: CustomZoomOptions = {}
): CustomZoomController {
    return new CustomZoomController(map, options);
}

export { CustomZoomController, type CustomZoomOptions };
