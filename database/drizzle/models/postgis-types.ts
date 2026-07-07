/**
 * postgis-types.ts
 *
 * Custom Drizzle column types for PostGIS geometry.
 *
 * Why custom types? drizzle-orm@1.0.0-beta.22's built-in geometry() hardcodes
 * geometry(point,...) regardless of the `type` option, so LineString needs
 * customType.
 *
 * Two read shapes, same column:
 * - Flat selects get raw EWKB hex text over the wire.
 * - Relational queries (`with: {...}`) build results via row_to_json/json_agg,
 *   and Postgres's implicit geometry -> json cast produces GeoJSON instead
 *   (`{ type: "Point", coordinates: [x, y] }`). `parsePointValue`/
 *   `parseLineStringValue` below handle both.
 *
 * `data` is typed non-null (XY, not XY | null) so Drizzle's `.notNull()`
 * narrowing works correctly on columns like vehiclePositions.location.
 * A genuine null (nullable column, no value) returns `null as unknown as T`
 * silently - that's the expected case Drizzle's own wrapper accounts for.
 * A non-null but unparseable value (corrupt data) throws instead of
 * returning a fake value - same crash you'd get downstream from a stray
 * null either way, but with a stack trace pointing at the actual bad row
 * instead of a `.x` on undefined three frames later.
 *
 * Deliberately uses DataView/Uint8Array rather than Buffer - Buffer needs
 * @types/node and doesn't exist on non-Node runtimes (edge/Workers); DataView
 * is a plain JS/web standard, zero extra config either way.
 *
 * ponytail: assumes 2D geometry only (matches how every column here is
 * declared - geometry(Point,srid) / geometry(LineString,srid), no Z). Add Z
 * handling if a 3D column is ever introduced.
 */

import { customType } from "drizzle-orm/pg-core";

export type XY = { x: number; y: number };
export type LineCoords = [number, number][];

// ---------------------------------------------------------------------------
// EWKB parsing (flat-select path)
// ---------------------------------------------------------------------------

interface ParsedEWKB {
    type: "Point" | "LineString" | "unknown";
    point?: XY;
    points?: XY[];
}

function hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

export function parseEWKB(hex: string): ParsedEWKB {
    if (
        typeof hex !== "string" ||
        hex.length < 10 ||
        hex.length % 2 !== 0 ||
        !/^[0-9a-fA-F]+$/.test(hex)
    ) {
        return { type: "unknown" };
    }

    try {
        const bytes = hexToBytes(hex);
        const view = new DataView(bytes.buffer);
        const le = view.getUint8(0) === 1;
        const rawType = view.getUint32(1, le);
        const hasSRID = !!(rawType & 0x20000000);
        const geomType = rawType & 0xffff;
        let offset = hasSRID ? 9 : 5;

        const readPoint = (): XY => {
            const x = view.getFloat64(offset, le);
            const y = view.getFloat64(offset + 8, le);
            offset += 16;
            return { x, y };
        };

        if (geomType === 1) return { type: "Point", point: readPoint() };

        if (geomType === 2) {
            const count = view.getUint32(offset, le);
            offset += 4;
            return { type: "LineString", points: Array.from({ length: count }, readPoint) };
        }

        return { type: "unknown" };
    } catch {
        // Truncated/corrupt hex -> a DataView read ran past the end. One
        // catch replaces a bounds-check before every single field read.
        return { type: "unknown" };
    }
}

// ---------------------------------------------------------------------------
// Shared parsers - GeoJSON (relational-query path) or EWKB hex (flat select).
// Called only for non-null values; throw on anything unrecognized.
//
// GeoJSON coordinates are cast to fixed-length tuples ([number, number],
// not number[]) so destructuring gives `number`, not `number | undefined`,
// under noUncheckedIndexedAccess - the runtime Array.isArray/.length checks
// still guard against genuinely short/malformed input before the cast.
// ---------------------------------------------------------------------------

function parsePointValue(value: unknown): XY {
    if (typeof value === "object" && value !== null) {
        const v = value as { type?: string; coordinates?: [number, number] };
        if (v.type === "Point" && Array.isArray(v.coordinates) && v.coordinates.length >= 2) {
            const [x, y] = v.coordinates;
            return { x, y };
        }
    } else if (typeof value === "string") {
        const parsed = parseEWKB(value);
        if (parsed.type === "Point" && parsed.point) return parsed.point;
    }
    throw new Error(`postgis-types: unparseable Point geometry: ${JSON.stringify(value)}`);
}

function parseLineStringValue(value: unknown): XY[] {
    if (typeof value === "object" && value !== null) {
        const v = value as { type?: string; coordinates?: [number, number][] };
        if (
            v.type === "LineString" &&
            Array.isArray(v.coordinates) &&
            v.coordinates.every((c) => Array.isArray(c) && c.length >= 2)
        ) {
            return v.coordinates.map(([x, y]) => ({ x, y }));
        }
    } else if (typeof value === "string") {
        const parsed = parseEWKB(value);
        if (parsed.type === "LineString" && parsed.points) return parsed.points;
    }
    throw new Error(`postgis-types: unparseable LineString geometry: ${JSON.stringify(value)}`);
}

// ---------------------------------------------------------------------------
// Column types
// ---------------------------------------------------------------------------

export const geometryPoint = (name: string, srid = 4326) =>
    customType<{ data: XY; driverData: string }>({
        dataType: () => `geometry(Point,${srid})`,
        toDriver: (v: XY) => `SRID=${srid};POINT(${v.x} ${v.y})`,
        fromDriver(value: unknown): XY {
            if (value == null) return null as unknown as XY;
            return parsePointValue(value);
        },
    })(name);

export const geometryPointTuple = (name: string, srid = 4326) =>
    customType<{ data: [number, number]; driverData: string }>({
        dataType: () => `geometry(Point,${srid})`,
        toDriver: (v: [number, number]) => `SRID=${srid};POINT(${v[0]} ${v[1]})`,
        fromDriver(value: unknown): [number, number] {
            if (value == null) return null as unknown as [number, number];
            const point = parsePointValue(value);
            return [point.x, point.y];
        },
    })(name);

export const geometryLineString = (name: string, srid = 4326) =>
    customType<{ data: LineCoords; driverData: string }>({
        dataType: () => `geometry(LineString,${srid})`,
        toDriver: (v: LineCoords) =>
            `SRID=${srid};LINESTRING(${v.map(([x, y]) => `${x} ${y}`).join(", ")})`,
        fromDriver(value: unknown): LineCoords {
            if (value == null) return null as unknown as LineCoords;
            return parseLineStringValue(value).map((p) => [p.x, p.y]);
        },
    })(name);

export const geometryLineStringXY = (name: string, srid = 4326) =>
    customType<{ data: XY[]; driverData: string }>({
        dataType: () => `geometry(LineString,${srid})`,
        toDriver: (v: XY[]) =>
            `SRID=${srid};LINESTRING(${v.map((p) => `${p.x} ${p.y}`).join(", ")})`,
        fromDriver(value: unknown): XY[] {
            if (value == null) return null as unknown as XY[];
            return parseLineStringValue(value);
        },
    })(name);
