/**
 * postgis-types.ts
 *
 * Custom Drizzle column types for PostGIS geometry.
 *
 * Why custom types?
 * - drizzle-orm@1.0.0-beta.22's built-in `geometry()` HARDCODES `geometry(point,...)` in getSQLType()
 *   regardless of the `type` option. The type option is silently ignored.
 * - For LineString (and any non-Point geometry) you MUST use customType.
 * - We also build an enhanced Point type that round-trips EWKB correctly via EWKT inserts.
 *
 * EWKB decoding is done manually (no external deps) matching drizzle's own utils approach.
 */

import { customType } from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** x = longitude, y = latitude */
export type XY = { x: number; y: number };
export type LineCoords = [number, number][];

// ---------------------------------------------------------------------------
// EWKB parser (handles Point and LineString, little-endian and big-endian)
// ---------------------------------------------------------------------------

function hexToBytes(hex: string): Uint8Array {
    const bytes: number[] = [];
    for (let c = 0; c < hex.length; c += 2) {
        bytes.push(parseInt(hex.slice(c, c + 2), 16));
    }
    return new Uint8Array(bytes);
}

interface ParsedEWKB {
    type: "Point" | "LineString" | "unknown";
    srid?: number;
    point?: XY;
    points?: XY[];
}

export function parseEWKB(hex: string): ParsedEWKB {
    const bytes = hexToBytes(hex);
    const view = new DataView(bytes.buffer);
    let offset = 0;

    const byteOrder = bytes[offset]; // 1 = little-endian, 0 = big-endian
    const le = byteOrder === 1;
    offset += 1;

    const rawType = view.getUint32(offset, le);
    offset += 4;

    const hasZ = !!(rawType & 0x80000000);
    const hasSRID = !!(rawType & 0x20000000);
    const geomType = rawType & 0x0000ffff;

    let srid: number | undefined;
    if (hasSRID) {
        srid = view.getUint32(offset, le);
        offset += 4;
    }

    const coordSize = hasZ ? 3 : 2;

    function readPoint(): XY {
        const x = view.getFloat64(offset, le);
        const y = view.getFloat64(offset + 8, le);
        offset += 8 * coordSize;
        return { x, y };
    }

    // wkbPoint = 1
    if (geomType === 1) {
        const point = readPoint();
        return { type: "Point", srid, point };
    }

    // wkbLineString = 2
    if (geomType === 2) {
        const numPoints = view.getUint32(offset, le);
        offset += 4;
        const points: XY[] = [];
        for (let i = 0; i < numPoints; i++) {
            points.push(readPoint());
        }
        return { type: "LineString", srid, points };
    }

    return { type: "unknown" };
}

// ---------------------------------------------------------------------------
// 1. geometry_point — Point column with xy object in/out
//    Uses EWKT for insert, parses EWKB on select.
//    Mirrors built-in PgGeometryObject but actually stores correct SQL type.
// ---------------------------------------------------------------------------

export const geometryPoint = (name: string, srid = 4326) =>
    customType<{ data: XY; driverData: string }>({
        dataType() {
            return `geometry(Point,${srid})`;
        },
        toDriver(value: XY): string {
            // EWKT format: PostGIS accepts this directly
            return `SRID=${srid};POINT(${value.x} ${value.y})`;
        },
        fromDriver(value: string): XY {
            const parsed = parseEWKB(value);
            if (parsed.type !== "Point" || !parsed.point) {
                throw new Error(`Expected Point EWKB, got: ${parsed.type}`);
            }
            return parsed.point;
        },
    })(name);

// ---------------------------------------------------------------------------
// 2. geometry_point_tuple — Point column with [x, y] tuple in/out
// ---------------------------------------------------------------------------

export const geometryPointTuple = (name: string, srid = 4326) =>
    customType<{ data: [number, number]; driverData: string }>({
        dataType() {
            return `geometry(Point,${srid})`;
        },
        toDriver(value: [number, number]): string {
            return `SRID=${srid};POINT(${value[0]} ${value[1]})`;
        },
        fromDriver(value: string): [number, number] {
            const parsed = parseEWKB(value);
            if (parsed.type !== "Point" || !parsed.point) {
                throw new Error(`Expected Point EWKB, got: ${parsed.type}`);
            }
            return [parsed.point.x, parsed.point.y];
        },
    })(name);

// ---------------------------------------------------------------------------
// 3. geometry_linestring — LineString column with array of [x,y] coords
// ---------------------------------------------------------------------------

export const geometryLineString = (name: string, srid = 4326) =>
    customType<{ data: LineCoords; driverData: string }>({
        dataType() {
            return `geometry(LineString,${srid})`;
        },
        toDriver(value: LineCoords): string {
            const coordStr = value.map(([x, y]) => `${x} ${y}`).join(", ");
            return `SRID=${srid};LINESTRING(${coordStr})`;
        },
        fromDriver(value: string): LineCoords {
            const parsed = parseEWKB(value);
            if (parsed.type !== "LineString" || !parsed.points) {
                throw new Error(`Expected LineString EWKB, got: ${parsed.type}`);
            }
            return parsed.points.map((p) => [p.x, p.y]);
        },
    })(name);

// ---------------------------------------------------------------------------
// 4. geometry_linestring_xy — LineString returning XY objects instead of tuples
// ---------------------------------------------------------------------------

export const geometryLineStringXY = (name: string, srid = 4326) =>
    customType<{ data: XY[]; driverData: string }>({
        dataType() {
            return `geometry(LineString,${srid})`;
        },
        toDriver(value: XY[]): string {
            const coordStr = value.map((p) => `${p.x} ${p.y}`).join(", ");
            return `SRID=${srid};LINESTRING(${coordStr})`;
        },
        fromDriver(value: string): XY[] {
            const parsed = parseEWKB(value);
            if (parsed.type !== "LineString" || !parsed.points) {
                throw new Error(`Expected LineString EWKB, got: ${parsed.type}`);
            }
            return parsed.points;
        },
    })(name);
