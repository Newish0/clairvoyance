# Shared Database Models for Clairvoyance - Realtime Transit 

To install dependencies:

```bash
bun install
```

# To generate migration files

Run 
```bash 
bunx drizzle-kit generate --name 'name_of_migration'
```

To generate custom migration files
```bash 
bunx drizzle-kit generate --name 'name_of_migration' --custom
```


# To run migrations

```bash
bunx drizzle-kit migrate
```