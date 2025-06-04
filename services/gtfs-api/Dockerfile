
FROM oven/bun:latest AS base
WORKDIR /usr/src/app


COPY services/gtfs-processor ../gtfs-processor
COPY services/gtfs-api .

RUN bun install

# run the app
USER bun
EXPOSE 5888/tcp
ENTRYPOINT [ "bun", "run", "start" ]