FROM oven/bun:1.3
WORKDIR /usr/src/app

COPY . .
WORKDIR /usr/src/app/transit-api/server
RUN bun install --frozen-lockfile --production

USER bun
EXPOSE 8000/tcp
ENTRYPOINT [ "bun", "run", "src/index.ts" ]