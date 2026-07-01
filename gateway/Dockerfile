FROM docker.io/oven/bun:1.3 AS builder
WORKDIR /app

ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}

COPY package.json bun.lock ./
COPY database/drizzle/package.json ./database/drizzle/package.json
COPY transit-api/server/package.json ./transit-api/server/package.json
COPY transit-api/test-client/package.json ./transit-api/test-client/package.json
COPY transit-ingest/package.json ./transit-ingest/package.json
COPY transit-app/package.json ./transit-app/package.json
COPY transit-app/scripts/ ./transit-app/scripts/
RUN bun install --frozen-lockfile --filter transit-app

COPY transit-app/ ./transit-app/
COPY database/ ./database/
COPY transit-api/ ./transit-api/
COPY tsconfig.json ./

WORKDIR /app/transit-app
RUN bun run build

FROM docker.io/nginx:alpine
WORKDIR /usr/share/nginx/html
COPY --from=builder /app/transit-app/dist/ ./
COPY gateway/nginx.conf /etc/nginx/nginx.conf
RUN rm -f /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
