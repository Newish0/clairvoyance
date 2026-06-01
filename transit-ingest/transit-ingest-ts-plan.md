# transit-ingest Plan (TS + Bun + ArkType)

Rewrite Python `gtfs-processor/` into TS CLI app. Bun runtime. ArkType validation via `drizzle-orm/arktype`. Two-phase execution: Phase 1 = single-thread async I/O, Phase 2 = add per-CSV-file Workers for parallel parse+validate.

## Never Throw

Zero exceptions in business logic. All errors are values. Every fallible function returns `Result<T, E>`.

```ts
type Result<T, E = IngestError> = { ok: true; value: T } | { ok: false; error: E };
```

- No `throw`. No `try/catch` in biz logic.
- ArkType: use `.safeParse()` (returns `{success, data, issues}`), never `.parse()`.
- Drizzle: `.onConflictDoUpdate()` handles constraints. Query errors return as Result.
- Mappers: return `Result<ParsedRow, IngestError>`.
- CSV rows: bad row → `{ok: false, error: Recoverable}` → log+skip. Fatal errors abort phase.
- Pipeline: collect `{ ok, error }` for each stage, report summary at end.
- Top-level `main.ts` has ONE `try/catch` at the entry boundary to print fatal errors.
- z library? `neverthrow` or hand-roll `Result` type. Hand-roll preferable (KISS).

---

## Stack

| Layer      | Choice                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| Runtime    | Bun 1.2+ (Windows-compatible)                                                                         |
| ORM        | Drizzle ORM (`drizzle-orm`) — reuse existing `database/drizzle/` schema                               |
| Validation | ArkType v2+ via `drizzle-orm/arktype` (`createInsertSchema`, `createSelectSchema`)                    |
| DateTime | `date-fns` v4 + `@date-fns/tz` — TZDate class, `{ in: tz(tzStr) }` context option for DST-safe arithmetic |
| Protobuf   | `@bufbuild/protobuf` — codegen via `buf` CLI from `gtfs-realtime.proto`                               |
| CSV        | `csv-parse` (node stream API)                                                                         |
| Geometry   | Drizzle `geometry()` type — point uses `mode:'xy'`, linestring uses raw `sql\`ST_GeomFromText(...)\`` |
| HTTP       | Bun native `fetch`                                                                                    |
| ZIP        | native `Bun.write` + `deflate`                                                           |
| CLI        | `cliffy` (Bun-native CLI framework)
| Config     | YAML via `jsr:@std/yaml` or `js-yaml`                                                                 |

---

## Project Layout

New sibling package `transit-ingest/` at repo root. Imports `database/drizzle/` as workspace dep via Bun workspaces.

```
clairvoyance/
  database/drizzle/           ← existing (schema source of truth)
  transit-ingest/             ← new package
    package.json
    tsconfig.json
    buf.gen.yaml              ← protobuf codegen config
    vendor/
      gtfs-realtime.proto     ← vendored protobuf
    src/
      main.ts                 ← CLI entry
      lib.ts                  ← re-exports
      context.ts              ← Context, PipelineConfig
      error.ts                ← Error types, ErrorSeverity

      pipeline/
        static-pipeline.ts    ← runStatic()
        realtime-pipeline.ts  ← runRealtime()
        realize-pipeline.ts   ← runRealizeInstances()

      gtfs/
        datetime.ts           ← convert_to_datetime exact port
        canonical-json.ts     ← _make_canonical + dict_hash exact port
        csv-decoder.ts        ← streaming CSV → batch iterator
        static-mapper.ts      ← CSV row → DB row (mapped)
        realtime-mapper.ts    ← protobuf → DB row
        trip-update-merge.ts  ← stop time merge logic

      db/
        client.ts             ← Drizzle client init
        static-upsert.ts      ← batch upsert per table
        realtime-upsert.ts    ← batch upsert for realtime tables
        delete.ts             ← ordered DELETE with FK handling

      source/
        gtfs-archive.ts       ← download + extract GTFS zip
        source-types.ts       ← Source type

      worker/
        csv-worker.ts         ← Worker entry: parse + validate CSV
        pool.ts               ← Worker pool management (Phase 2)
```

---

## Worker Concurrency (Phase 2)

### Phase 1 — Single thread, async I/O only

```
Main thread:
  download zip → extract → for each CSV:
    csv-parse stream → validate row (ArkType) → buffer batch → db upsert
```

All on one thread. Bun event loop handles async I/O. CSV parse + ArkType validate blocks event loop during large files (stop_times.csv). Acceptable for phase 1.

### Phase 2 — Per-CSV-file Workers

```
Main thread:
  download zip → extract
  for each CSV file:
    spawn Worker(csv-file-path, schema-type)
    Worker: csv-parse stream → ArkType validate each row → batch rows
    Worker: postMessage(batch) back to main
    Main: receive batch → db.upsert()
  Worker terminates
  next CSV file
```

**Why Workers help**: ArkType `parse()` is the bottleneck — timezone datetime conversion per row, nested object validation (TranslationMap, EntitySelector). Spinning 4 Workers for 4 CSV files gives true parallel validation.

**No Worker-to-Worker messaging**: Workers send validated batches to main thread. Main thread owns single DB pool. Simple backpressure: if main thread backlog grows, messages queue in Bun's microtask queue.

---

## GTFS Datetime Port (critical correctness)

### Python original logic

```python
def convert_to_datetime(date_str, time_str, tz_str="UTC"):
    h, m, s = parse_hhmmss(time_str)
    localized_noon = get_noon_in_timezone(tz_str, date_str)  # tz.localize(datetime(12,0,0))
    service_midnight = tz.normalize(localized_noon - timedelta(hours=12))
    result = tz.normalize(service_midnight + timedelta(hours=h, minutes=m, seconds=s))
    return result
```

### TS port with `date-fns` v4 + `@date-fns/tz`

```ts
import { tz } from "@date-fns/tz";
import { addHours, add, parse, set } from "date-fns";

function convertToDatetime(
  dateStr: string,    // YYYYMMDD
  timeStr: string,    // HHH:MM:SS or H:MM:SS
  tzStr: string = "UTC"
): Date | null {
  const [h, m, s] = parseHHMMSS(timeStr);
  if (h === null) return null;

  const date = parse(dateStr, "yyyyMMdd", new Date());
  const noonDate = set(date, { hours: 12, minutes: 0, seconds: 0, milliseconds: 0 });

  // `{ in: tz(tzStr) }` tells date-fns to do arithmetic in target timezone
  // Handles DST transitions correctly (same as Python's tz.normalize)
  const midnight = addHours(noonDate, -12, { in: tz(tzStr) });
  const result = add(midnight, { hours: h, minutes: m, seconds: s }, { in: tz(tzStr) });

  return result;
}
```

**Key**: `{ in: tz(tzStr) }` context option — tells date-fns to perform DST-safe arithmetic in target timezone. Same semantics as Python's `tz.normalize(noon - 12h) + duration`. Test with Python fixture output.

---

## Canonical JSON (alert dedup correctness)

Port Python `_make_canonical` exactly:

```ts
function makeCanonical(obj: unknown): unknown {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === "object") {
        if (Array.isArray(obj)) {
            const canon = obj.map(makeCanonical);
            return canon.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
        }
        if (obj instanceof Date) return obj.toISOString();
        const entries = Object.entries(obj as Record<string, unknown>).sort(([a], [b]) =>
            a.localeCompare(b),
        );
        return Object.fromEntries(entries.map(([k, v]) => [k, makeCanonical(v)]));
    }
    return obj;
}
```

Test: Python generates JSON of alert dicts + MD5 hashes. TS asserts exact match.

---

## Protobuf Setup

1. Install `@bufbuild/protobuf` + `@bufbuild/protoc-gen-es`
2. Write `buf.gen.yaml`:
    ```yaml
    version: v2
    plugins:
        - local: protoc-gen-es
          out: src/proto
          opt: target=ts
    inputs:
        - directory: vendor
    ```
3. Vendored `vendor/gtfs-realtime.proto` from gtfs-realtime spec
4. Run `buf generate`
5. Generated types in `src/proto/gtfs-realtime_pb.ts`

```ts
import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { FeedMessageSchema } from "./proto/gtfs-realtime_pb";
```

---

## Drizzle Geometry Handling

### Point (stops.location)

```ts
// schema (already exists):
location: geometry("location", { type: "point", srid: 4326 });

// insert — Drizzle handles WKB conversion:
db.insert(stops).values({
    stop_sid: "1234",
    location: { x: lng, y: lat }, // mode:'xy' object
});
```

**Important**: Existing schema has no `mode` param. Drizzle default mode for geometry is `tuple`. Need either:

- Add `mode: 'xy'` to schema definition
- Or use tuple `[lng, lat]` in insert values

Recommend: Add `mode: 'xy'` to schema for readability. Verify with existing DB.

### Linestring (shapes.path)

```ts
// schema (already exists):
path: geometry("path", { type: "linestring", srid: 4326 }).notNull();

// insert — need raw SQL for PostGIS:
import { sql } from "drizzle-orm";

db.insert(shapes).values({
    shape_sid: "shape_1",
    path: sql`ST_GeomFromText('LINESTRING(${wktPoints})', 4326)`,
    // wktPoints = "lng1 lat1, lng2 lat2, ..."
});
```

### Single-point shape hack

If shape has < 2 points, duplicate last point with +0.00001 offset:

```ts
function ensureLinestring(points: Array<[number, number]>): Array<[number, number]> {
    if (points.length >= 2) return points;
    if (points.length === 0) return [];
    const [lng, lat] = points[0];
    return [points[0], [lng + 0.00001, lat + 0.00001]];
}
```

---

## Drizzle Enum Mapping (ArkType)

`drizzle-orm/arktype` `createInsertSchema` handles PG enum columns automatically:

```ts
const insertRouteSchema = createInsertSchema(routes);
// type: { route_sid: string, agency_id: string, type: "TRAM" | "SUBWAY" | ... }
```

GTFS→PG enum mapper needed for route_type int→string:

```ts
const ROUTE_TYPE_MAP: Record<number, RouteType> = {
    0: "TRAM",
    1: "SUBWAY",
    2: "RAIL",
    3: "BUS",
    4: "FERRY",
    5: "CABLE_TRAM",
    6: "AERIAL_LIFT",
    7: "FUNICULAR",
    // 8-10: unmapped (deprecated GTFS v1)
    11: "TROLLEYBUS",
    12: "MONORAIL",
};

function mapRouteType(int: number): RouteType {
    return ROUTE_TYPE_MAP[int]; // undefined → ArkType catch
}
```

---

## DELETE Order

Same as Rust plan but in TS with Drizzle:

```ts
await db.transaction(async (tx) => {
    await tx.update(stops).set({ parentStationId: null }).where(eq(stops.agencyId, agencyId));
    await tx.delete(stopTimes).where(eq(stopTimes.agencyId, agencyId));
    await tx.delete(tripInstances).where(eq(tripInstances.agencyId, agencyId));
    await tx.delete(calendarDates).where(eq(calendarDates.agencyId, agencyId));
    await tx.delete(shapes).where(eq(shapes.agencyId, agencyId));
    await tx.delete(trips).where(eq(trips.agencyId, agencyId));
    await tx.delete(stops).where(eq(stops.agencyId, agencyId));
    await tx.delete(routes).where(eq(routes.agencyId, agencyId));
    await tx.delete(agencies).where(eq(agencies.id, agencyId));
    await tx.delete(transfers).where(eq(transfers.agencyId, agencyId));
    await tx.delete(frequencies).where(eq(frequencies.agencyId, agencyId));
    await tx.delete(feedInfo).where(eq(feedInfo.agencyId, agencyId));
});
```

---

## Implementation Phases

### Phase 1: Single-thread async I/O

#### 1.1 Scaffold

- `bun init` in `transit-ingest/`
- `package.json` with `"type": "module"`, Bun workspaces root reference
- `tsconfig.json`
- dependencies: `drizzle-orm`, `drizzle-kit`, `arktype`, `@bufbuild/protobuf`, `csv-parse`, `date-fns` (v4+), `@date-fns/tz`, `commander` or `cliffy`
- `buf.gen.yaml` + vendored `gtfs-realtime.proto`
- `bun run buf:generate` → `src/proto/gtfs-realtime_pb.ts`
- Verify: `bun run src/main.ts --help` prints help

#### 1.2 DB Client + Context

- `db/client.ts`: Drizzle init with Bun SQL driver

    ```ts
    import { drizzle } from "drizzle-orm/bun-sql";
    import { sql } from "bun";

    const connection = sql(process.env.DATABASE_URL!);
    export const db = drizzle(connection, { schema });
    ```

- `context.ts`: `Context` type with `db`, `AbortController`, `agencyId`, `config`
- `error.ts`: `IngestError` (tagged union with `severity: 'recoverable' | 'fatal'` + `code` + `message` + `cause?`), `Result<T, E>` type, helpers (`ok(value)`, `err(error)`, `isOk`, `isErr`, `unwrapOr`)

#### 1.3 GTFS Datetime + Canonical JSON

- `datetime.ts`: `convertToDatetime()` with `parseHHMMSS()`, DST-safe noon-minus-12h logic
- Python fixture test: Python script generates JSON → Bun test reads + asserts
- `canonical-json.ts`: `makeCanonical()` + `dictHash()`
- Python fixture test: alert hashes

#### 1.4 CSV Decoder

- `csv-decoder.ts`: `AsyncGenerator<Result<Record<string, string>[]>>` using `csv-parse` stream
- Parse error per row → yields `{ok: false, error: Recoverable}`. Caller decides skip/abort.
- Batch size configurable (default 1000)
- Header strings allocated once per batch

#### 1.5 Static Pipeline

- `static-mapper.ts`: One mapper per table. Returns `Result<ParsedRow>`. Bad CSV rows → `err(Recoverable)`.
    - `ok(row)` → collected into batch. `err(e)` → logged, row skipped, counter incremented.
- `static-upsert.ts`: Batch upsert per table via `db.insert().values().onConflictDoUpdate()`. Returns `Result<UpsertSummary>`.
- `static-pipeline.ts`: download → delete → forEach CSV: decode → validate → upsert.
    - Pipeline collects `{ table: string, ok: number, skipped: number, errors: IngestError[] }` summary.
    - On fatal error: returns `err(Fatal)` immediately. On recoverable: continues, includes in summary.
- `db/delete.ts`: Ordered DELETE in transaction with parent_station_id NULL step. Returns `Result<void>`.

#### 1.6 ArkType Validation

- `createInsertSchema(table)` for each table
- Custom refinements for geometry, datetime conversion
- Validated row → `insertSchema.safeParse(row)` → `{success, data, issues}`
- Wrap in helper: `validate<T>(schema: ArkTypeSchema, row: unknown): Result<T>`
    - `success` → `ok(data)`; `issues` → `err(Recoverable)` with formatted issues

#### 1.7 Realtime Pipeline

- `realtime-mapper.ts`: trip_descriptor, vehicle_position, alert, stop_time_update mappers
- Enum mapping dicts (route_type crash fix: ints 8-10 → undefined)
- `cleanTimeValue(0) → null`, `extractCoreTripId`, `normalizeTimes`
- `trip-update-merge.ts`: match by stop_id first, fallback stop_sequence, both-miss → return `err(Recoverable)`
- `realtime-pipeline.ts`: sequential URL poll, entity dispatch, content hash dedup. Collects per-entity Result, logs recoverable, aborts on fatal.

#### 1.8 Realize Instances

- `realize-pipeline.ts`: pre-flight check (returns `err(Fatal)` if zero trips), batch inner queries (1000 per batch), materialize. Returns `Result<RealizeSummary>`.

#### 1.9 CLI

```ts
// 3 subcommands matching Python CLI:
// transit-ingest static --agency-id X --gtfs-url Y
// transit-ingest realtime --agency-id X --gtfs-urls Y Z --poll 30
// transit-ingest realize-instances --agency-id X --min-date Y --max-date Z
// --database-url reads from DATABASE_URL env var
// --verbose / -v for debug logging
```

#### 1.10 Graceful Shutdown

```ts
const ac = new AbortController();
process.on("SIGINT", () => ac.abort());
// Bun on Windows: SIGINT only (Ctrl+C)
```

---

### Phase 2: Add Workers

#### 2.1 Worker Entry Point

- `worker/csv-worker.ts`: receives `{csvPath, tableName, agencyId}` via `workerData`
- Streams CSV, validates each row with ArkType (`.safeParse()`), batches validated rows
- `postMessage({ type: "batch", tableName, rows: ParsedRow[] })` — only valid rows in batch
- `postMessage({ type: "error", tableName, error: { code, message, row? } })` — per bad row, sent immediately
- `postMessage({ type: "complete", tableName, summary: { ok, skipped } })` — done
- Never throws inside Worker. All errors → `postMessage({type:"error"})`.

#### 2.2 Worker Pool

- `worker/pool.ts`: manages Worker lifecycle
- `processFile(csvPath, tableName) → Promise<Result<WorkerSummary>>`
- Batches from Workers queued on main thread for DB upsert
- Error messages from Workers → aggregated into pipeline summary
- Worker crash (uncaught) → `err(Fatal)` — but this should never happen since Worker never throws

#### 2.3 Workerized Static Pipeline

```ts
// Phase 2: start Workers in parallel for all CSV files
const workers = files.map(([name, path]) => pool.processFile(path, name));
await Promise.all(workers);
```

#### 2.4 Backpressure

- If main thread upsert backlog grows, `postMessage` buffers in port
- Structured clone overhead acceptable for 1000-row batches
- Workers naturally slow as port queue fills

#### 2.5 Migration

- Phase 1 `static-pipeline.ts` preserved as fallback
- Phase 2 `static-pipeline.ts` checks if Workers available, uses pool

---

## Files Requiring Python Equivalence Tests

| File                   | Python source                                     | Test method                                                        |
| ---------------------- | ------------------------------------------------- | ------------------------------------------------------------------ |
| `datetime.ts`          | `convert_to_datetime` on 20+ cases                | Python script → JSON fixture → Bun test asserts exact `Date` match |
| `canonical-json.ts`    | `_make_canonical` + `_dict_hash` on alert structs | Python script → JSON fixture → Bun test asserts hash match         |
| `trip-update-merge.ts` | `_process_stop_time_updates` behavior             | Unit tests: stop_id match, stop_sequence fallback, both-miss       |

---

## Key Decisions Summary

| Decision        | Choice                                         | Reasoning                                                                     |
| --------------- | ---------------------------------------------- | ----------------------------------------------------------------------------- |
| Error handling  | Never throw. All errors = `Result<T,E>` values | Predictable control flow. No hidden exceptions. Every caller sees error type. |
| Runtime         | Bun 1.2+                                       | Native TS/TSX, built-in SQL driver, Worker support, fast                      |
| ORM             | Drizzle                                        | Already owns schema. Workspace dep.                                           |
| Validation      | ArkType via `drizzle-orm/arktype`              | Auto-generate from schema. Type-first. Smaller than Zod.                      |
| DateTime | `date-fns` v4 + `@date-fns/tz` | Built-in timezone. `{ in: tz(tzStr) }` context for DST-safe arithmetic. No extra `date-fns-tz` dep. |
| Protobuf        | `@bufbuild/protobuf`                           | Modern, TS-first, clean codegen. Active.                                      |
| CSV             | `csv-parse`                                    | Stream-based, handles edge cases, works in Bun                                |
| Geometry        | Drizzle `geometry()` type                      | Point → `{x,y}` object. Linestring → raw `sql\`ST_GeomFromText\``             |
| Concurrency Ph1 | Async I/O, no Workers                          | Simple, ship fast                                                             |
| Concurrency Ph2 | Per-CSV-file Workers                           | True parallel validation. ArkType parse is bottleneck.                        |
| Pipeline shape  | 3 concrete functions                           | static, realtime, realize-instances (same as Python CLI)                      |

---

## Critical "Don't Forget"

- [ ] **Never throw**: ALL fallible fns return `Result<T, E>`. NO `throw` in biz logic. ONE try/catch at `main.ts` entry boundary.
- [ ] ArkType: always `.safeParse()`, never `.parse()`.
- [ ] `cleanTimeValue(0) → null` everywhere
- [ ] `extractCoreTripId` on every protobuf trip_id (`split('#')[0]`)
- [ ] Shape single-point +0.00001 hack
- [ ] Shape `dist_traveled` → `{"values": [...]}` (JSONB dict, not array)
- [ ] Stop `location` → Drizzle `{x: lng, y: lat}` (lng FIRST)
- [ ] RouteType: ints 8-10 → undefined (ArkType catches)
- [ ] Vehicle position change detection: 11 fields (lat, lng, bearing, speed, odometer, stop_id, stop_sequence, current_status, congestion, occupancy_status, occupancy_pct)
- [ ] Alert dedup: `makeCanonical` + MD5 → match Python exactly
- [ ] `DATABASE_URL` env var fallback
- [ ] Self-referential FK on stops: SET NULL before DELETE
- [ ] Trip instance merge: match by stop_id first, fallback stop_sequence, both-miss → `err(Recoverable)`
- [ ] Protobuf required fields: verify `@bufbuild/protobuf` codegen output handles proto2 required
- [ ] Graceful shutdown: AbortController + exit 130
- [ ] Windows: SIGINT only (Ctrl+C). SIGTERM not available in Bun on Windows.
