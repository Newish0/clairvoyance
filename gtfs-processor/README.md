

DATABASE_URL=postgresql+asyncpg://transit:transit@localhost:5432/transit


uv run ./src/cli.py --database_url="postgresql+asyncpg://transit:transit@localhost:5432/transit" static --agency_id=BCT-48 --gtfs_url=https://bct.tmix.se/Tmix.Cap.TdExport.WebApi/gtfs/?operatorIds=48 