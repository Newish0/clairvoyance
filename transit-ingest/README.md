# transit-ingest

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run src/main.ts 

```

With verbose output for dev:

```bash
bun run src/main.ts --verbose
```

With pretty output for dev:

```bash
bun run src/main.ts --pretty
```

## Database Timezone

The database is assumed to run with `TimeZone = 'UTC'`.

**Note:** This assumption is for developer clarity, not functional correctness. `TIMESTAMPTZ` columns always store UTC internally regardless of the PostgreSQL server's `TimeZone` setting. The UTC assumption ensures consistent behavior across environments and simplifies debugging.

All moment-in-time columns use `TIMESTAMPTZ`; never bare `TIMESTAMP`.

