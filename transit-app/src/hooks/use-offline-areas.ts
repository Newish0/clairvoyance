import { useLocalStorageState, useMemoizedFn } from "ahooks";
import { z } from "zod";
import { LngLatBounds } from "maplibre-gl";

// [[west, south], [east, north]] - matches LngLatBounds#toArray()
const bboxSchema = z.tuple([z.tuple([z.number(), z.number()]), z.tuple([z.number(), z.number()])]);

const areaSchema = z.object({
    id: z.string(),
    name: z.string(),
    bbox: bboxSchema,
    state: z.enum(["downloading", "downloaded", "error"]),
    sizeBytes: z.number().optional(),
    error: z.string().optional(),
    createdAt: z.number(),
    updatedAt: z.number().nullable(),
});
const areasSchema = z.array(areaSchema);

export type OfflineAreaState = z.infer<typeof areaSchema.shape.state>;
export type OfflineArea = z.infer<typeof areaSchema>;

const KEY = "offline-areas";

export function useOfflineAreas() {
    const [areas, setAreas] = useLocalStorageState<OfflineArea[]>(KEY, {
        defaultValue: [],
        listenStorageChange: true, // cross-tab sync, handled by ahooks
        deserializer: (raw) => {
            const parsed = areasSchema.safeParse(JSON.parse(raw));
            return parsed.success ? parsed.data : []; // ponytail: invalid/stale schema -> reset, no migration
        },
    });

    const createArea = useMemoizedFn((input: { name: string; bounds: LngLatBounds }) => {
        const area: OfflineArea = {
            id: crypto.randomUUID(),
            name: input.name,
            bbox: input.bounds.toArray(),
            state: "downloading",
            createdAt: Date.now(),
            updatedAt: null,
        };
        setAreas([...areas, area]);
        return area;
    });

    const updateArea = useMemoizedFn(
        (id: string, patch: Partial<Omit<OfflineArea, "id" | "createdAt" | "updatedAt">>) => {
            setAreas(
                areas.map((a) =>
                    a.id === id
                        ? { ...a, ...patch, createdAt: a.createdAt, updatedAt: Date.now() }
                        : a,
                ),
            );
        },
    );

    const removeArea = useMemoizedFn((id: string) => {
        setAreas(areas.filter((a) => a.id !== id));
    });

    return { areas, createArea, updateArea, removeArea };
}
