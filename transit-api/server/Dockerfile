FROM oven/bun:1.3 AS base
WORKDIR /usr/src/app

# install dependencies into temp directory
# this will cache them and speed up future builds
FROM base AS install
RUN mkdir -p /temp/dev
COPY transit-api/package.json transit-api/bun.lock /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile

# install with --production (exclude devDependencies)
RUN mkdir -p /temp/prod
COPY transit-api/package.json transit-api/bun.lock /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

# copy node_modules from temp directory
# then copy all (non-ignored) project files into the image
FROM base AS prerelease
COPY --from=install /temp/dev/node_modules transit-api/node_modules
COPY transit-api transit-api
COPY gtfs-processor/shared/gtfs-db-types gtfs-processor

ENV NODE_ENV=production

# copy production dependencies and source code into final image
FROM base AS release
COPY --from=install /temp/prod/node_modules transit-api/node_modules
COPY --from=prerelease /usr/src/app/transit-api transit-api
COPY --from=prerelease /usr/src/app/gtfs-processor gtfs-processor

# run the app
USER bun
EXPOSE 3000/tcp
WORKDIR transit-api
ENTRYPOINT [ "bun", "run", "src/index.ts" ]