import { z } from "zod";

export const WorldBaseSchema = z.object({
    tiles: z.string(),
    extractMaxZoom: z.number(),
});

export const BboxSchema = z.object({
    minLon: z.number(),
    minLat: z.number(),
    maxLon: z.number(),
    maxLat: z.number(),
});

export const TileDatasetSchema = z.object({
    id: z.string(),
    bbox: BboxSchema,
    tiles: z.string(),
    minZoom: z.number(),
    maxZoom: z.number(),
});

export const TileManifestSchema = z.object({
    version: z.string(),
    source: z.string(),
    worldBase: WorldBaseSchema,
    datasets: z.array(TileDatasetSchema),
});

export type TileManifest = z.infer<typeof TileManifestSchema>;
export type TileDataset = z.infer<typeof TileDatasetSchema>;
export type WorldBase = z.infer<typeof WorldBaseSchema>;

export function assertManifestAgrees(manifest: TileManifest, dirName: string): void {
    const expected = `${dirName}/`;
    const paths = [manifest.worldBase.tiles, ...manifest.datasets.map((d) => d.tiles)];
    for (const p of paths) {
        if (!p.startsWith(expected)) {
            throw new Error(
                `tiles path "${p}" doesn't match dirName "${dirName}" - expected prefix "${expected}"`,
            );
        }
    }
}
