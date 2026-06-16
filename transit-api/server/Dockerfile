FROM docker.io/oven/bun:1.3 AS builder
WORKDIR /app

ARG TARGETARCH

COPY package.json bun.lock ./
COPY database/drizzle/package.json ./database/drizzle/package.json
COPY transit-api/server/package.json ./transit-api/server/package.json
COPY transit-api/test-client/package.json ./transit-api/test-client/package.json
COPY transit-ingest/package.json ./transit-ingest/package.json
COPY transit-app/package.json ./transit-app/package.json
RUN bun install --frozen-lockfile --filter transit-api

COPY transit-api/ ./transit-api/
COPY database/ ./database/
COPY tsconfig.json ./

RUN case "$TARGETARCH" in \
      amd64) BUN_TARGET="bun-linux-x64-baseline" ;; \
      arm64) BUN_TARGET="bun-linux-arm64" ;; \
      *) echo "Unsupported architecture: $TARGETARCH" && exit 1 ;; \
    esac && \
    bun build --compile --minify --target=$BUN_TARGET \
    ./transit-api/server/src/index.ts --outfile /app/api

FROM docker.io/debian:stable-slim
COPY --from=builder /app/api /usr/local/bin/api
USER nobody
EXPOSE 8000
CMD ["api"]