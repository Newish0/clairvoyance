from pydantic_to_ts import generate_typescript_defs, generate_zod_schemas

generate_typescript_defs("models", "./shared/gtfs-db-types/types.ts")

# Zod Schema also export inferred types
# generate_zod_schemas("models", "./shared/gtfs-db-types/schemas.ts")
