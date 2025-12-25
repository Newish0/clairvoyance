

DATABASE_URL=postgresql+asyncpg://transit:transit@localhost:5432/transit


uv run ./src/cli.py --connection_string="postgresql+asyncpg://transit:transit@localhost:5432/transit" --database_name=transit static --agency_id=BCT-48 --gtfs_url=https://bct.tmix.se/Tmix.Cap.TdExport.WebApi/gtfs/?operatorIds=48 