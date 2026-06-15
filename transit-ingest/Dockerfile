FROM oven/bun:1.3 AS builder
WORKDIR /app

COPY package.json bun.lock ./
COPY database/drizzle/package.json ./database/drizzle/package.json
COPY transit-api/server/package.json ./transit-api/server/package.json
COPY transit-api/test-client/package.json ./transit-api/test-client/package.json
COPY transit-ingest/package.json ./transit-ingest/package.json
COPY transit-app/package.json ./transit-app/package.json
RUN bun install --frozen-lockfile --filter transit-ingest

COPY transit-ingest/ ./transit-ingest/
COPY database/ ./database/
COPY tsconfig.json ./

RUN bun build --compile --minify --target=bun-linux-x64-baseline \
    ./transit-ingest/src/main.ts --outfile /app/ingest

FROM debian:stable-slim
COPY --from=builder /app/ingest /usr/local/bin/ingest
COPY --from=builder /app/transit-ingest/appconfig.yaml /etc/ingest/appconfig.yaml
USER nobody
ENTRYPOINT ["ingest", "from-config", "/etc/ingest/appconfig.yaml", "-v"]
