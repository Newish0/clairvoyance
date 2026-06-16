FROM docker.io/oven/bun:1.3
WORKDIR /app

COPY package.json bun.lock ./
COPY database/drizzle/package.json ./database/drizzle/package.json
COPY transit-api/server/package.json ./transit-api/server/package.json
COPY transit-api/test-client/package.json ./transit-api/test-client/package.json
COPY transit-ingest/package.json ./transit-ingest/package.json
COPY transit-app/package.json ./transit-app/package.json
RUN bun install --frozen-lockfile --filter database

COPY database/ ./database/

WORKDIR /app/database/drizzle

CMD ["bunx", "drizzle-kit", "migrate", "--config=./drizzle.config.ts"]