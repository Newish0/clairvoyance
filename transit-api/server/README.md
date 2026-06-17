# transit-api

tRPC v11 API server for the Clairvoyance realtime transit system. Serves GTFS transit data to the frontend via type-safe RPC endpoints.

## Tech Stack

- **Runtime**: Bun (native HTTP, `Bun.serve()`)
- **Framework**: tRPC v11 with SSE transport + superjson
- **Database**: PostgreSQL 18 + PostGIS 3 via Drizzle ORM
- **Validation**: valibot
- **Error Handling**: neverthrow (Result type)

## Development

```bash
bun run dev
```

Runs with `--watch` on `http://localhost:8000`.

## API Endpoints

| Router | Procedures |
|---|---|
| `shape` | Query transit shape geometries |
| `tripInstance` | Real-time & scheduled trip instances |
| `stop` | Stops, stop times, and stop routes |
| `alert` | Active transit alerts |

All endpoints are accessible via tRPC client at `http://localhost:8000/`.

## Docker

Multi-stage build produces a standalone binary:

```bash
docker build -f transit-api/server/Dockerfile ../../
```

Binary listens on port 8000; expects `DATABASE_URL` env var.

## Exported Types

```ts
import type { AppRouter } from "transit-api";
// or
import type { AppRouter } from "transit-api/types";
```