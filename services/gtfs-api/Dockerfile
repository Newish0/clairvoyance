
FROM oven/bun:latest AS base
WORKDIR /usr/src/app

# install dependencies into temp directory
# this will cache them and speed up future builds
FROM base AS install
# RUN mkdir -p /temp/dev


# COPY gtfs-api/package.json gtfs-api/bun.lock /temp/dev/
# COPY gtfs-processor /temp 
# RUN cd /temp/dev && bun install --frozen-lockfile

# install with --production (exclude devDependencies)

# NOTE: Context is the entire services directory because 
#       we need to use packages from gtfs-processor
RUN mkdir -p /temp/prod
COPY gtfs-api/package.json gtfs-api/bun.lock /temp/prod/
COPY gtfs-processor /temp/gtfs-processor
RUN cd /temp/prod && bun install --frozen-lockfile --production

# # copy node_modules from temp directory
# # then copy all (non-ignored) project files into the image
# FROM base AS prerelease
# COPY --from=install /temp/dev/node_modules node_modules
# COPY gtfs-api .

# copy production dependencies and source code into final image
FROM base AS release
COPY --from=install /temp/prod/node_modules node_modules
COPY gtfs-api .

# run the app
USER bun
EXPOSE 5888/tcp
ENTRYPOINT [ "bun", "run", "start" ]