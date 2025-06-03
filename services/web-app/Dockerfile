



# # Use a Python image with uv pre-installed
# FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim AS gtfs-processor-builder

# WORKDIR /usr/src/gtfs-processor

# # Enable bytecode compilation
# ENV UV_COMPILE_BYTECODE=1

# # Copy from the cache instead of linking since it's a mounted volume
# ENV UV_LINK_MODE=copy

# # Install the project's dependencies using the lockfile and settings
# RUN --mount=type=cache,target=/root/.cache/uv \
#     --mount=type=bind,source=/services/gtfs-processor/uv.lock,target=uv.lock \
#     --mount=type=bind,source=/services/gtfs-processor/pyproject.toml,target=pyproject.toml \
#     uv sync --locked --no-install-project --no-dev

# # Then, add the rest of the project source code and install it
# # Installing separately from its dependencies allows optimal layer caching
# COPY /services/gtfs-processor /usr/src/gtfs-processor
# RUN --mount=type=cache,target=/root/.cache/uv \
#     uv sync --locked --no-dev

# # Place executables in the environment at the front of the path
# ENV PATH="/app/.venv/bin:$PATH"

# # Reset the entrypoint, don't invoke `uv`
# ENTRYPOINT []

# RUN uv run ./src/gen_ts_types.py





# FROM oven/bun:latest AS gtfs-api-builder
# WORKDIR /usr/src/gtfs-api

# COPY --from=gtfs-processor-builder /usr/src/gtfs-processor/shared/gtfs-db-types /usr/src/gtfs-processor/shared/gtfs-db-types

# COPY /services/gtfs-api .
# RUN bun install --frozen-lockfile
# RUN bun run build-treaty







FROM oven/bun:latest AS base

ARG PUBLIC_GTFS_API_ENDPOINT
ARG GTFS_API_ENDPOINT=http://gtfs-api:5888

WORKDIR /app
COPY /services/web-app/ .

COPY /services/gtfs-processor/shared/gtfs-db-types ../gtfs-processor/shared/gtfs-db-types

COPY /services/gtfs-api/ ../gtfs-api/


# COPY --from=gtfs-processor-builder /usr/src/gtfs-processor/shared/gtfs-db-types ../gtfs-processor/shared/gtfs-db-types

# COPY --from=gtfs-api-builder /usr/src/gtfs-api/dist ../gtfs-api/dist


RUN bun install --prod --frozen-lockfile --force
RUN bun run build

ENV HOST=0.0.0.0
ENV PORT=4321
EXPOSE 4321
CMD ["bun", "./dist/server/entry.mjs"]