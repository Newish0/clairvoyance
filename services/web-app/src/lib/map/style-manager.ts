import type {
    Map as MapLibreMap,
    SourceSpecification,
    LayerSpecification,
    StyleSpecification,
} from "maplibre-gl";

class StyleManager {
    private map: MapLibreMap;
    private customSources: Map<string, SourceSpecification>;
    private customLayers: LayerSpecification[];

    constructor(map: MapLibreMap) {
        this.map = map;
        this.customSources = new Map();
        this.customLayers = [];
    }

    addSource(id: string, source: SourceSpecification): void {
        this.map.addSource(id, source);
        this.customSources.set(id, source);
    }

    addLayer(layer: LayerSpecification): void {
        this.map.addLayer(layer);
        this.customLayers.push(layer);
    }

    removeLayer(layerId: string): void {
        if (this.map.getLayer(layerId)) {
            this.map.removeLayer(layerId);
        }
        this.customLayers = this.customLayers.filter((layer) => layer.id !== layerId);
    }

    removeSource(sourceId: string): void {
        if (this.map.getSource(sourceId)) {
            this.map.removeSource(sourceId);
        }
        this.customSources.delete(sourceId);
    }

    changeStyle(style: string | StyleSpecification): Promise<void> {
        return new Promise((resolve, reject) => {
            // Store current custom data
            const sources = new Map(this.customSources);
            const layers = [...this.customLayers];

            // Set up error handling
            const onError = (e: any) => {
                this.map.off("styledata", onStyleData);
                reject(e);
            };

            const onStyleData = () => {
                try {
                    // Restore sources first
                    sources.forEach((source, id) => {
                        if (!this.map.getSource(id)) {
                            this.map.addSource(id, source);
                        }
                    });

                    // Then restore layers
                    layers.forEach((layer) => {
                        if (!this.map.getLayer(layer.id)) {
                            this.map.addLayer(layer);
                        }
                    });

                    this.map.off("error", onError);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            };

            this.map.once("styledata", onStyleData);
            this.map.once("error", onError);

            this.map.setStyle(style);
        });
    }

    // Get current custom sources and layers
    getCustomSources(): Map<string, SourceSpecification> {
        return new Map(this.customSources);
    }

    getCustomLayers(): LayerSpecification[] {
        return [...this.customLayers];
    }

    // Clear all custom data
    clear(): void {
        this.customLayers.forEach((layer) => {
            if (this.map.getLayer(layer.id)) {
                this.map.removeLayer(layer.id);
            }
        });

        this.customSources.forEach((_, sourceId) => {
            if (this.map.getSource(sourceId)) {
                this.map.removeSource(sourceId);
            }
        });

        this.customSources.clear();
        this.customLayers = [];
    }
}

export { StyleManager };
