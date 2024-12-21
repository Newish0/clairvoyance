# GTFS API

A Python-based API for handling GTFS (General Transit Feed Specification) data, both static and realtime. This API allows you to store transit data in a PostgreSQL database and provides REST endpoints for accessing the data.

## Features

- Load and store static GTFS data
- Fetch and store realtime GTFS updates
- REST API endpoints for accessing transit data
- Support for multiple transit agencies
- PostgreSQL database storage

## Prerequisites

- Python 3.8+
- PostgreSQL database
- pip (Python package manager)

## Setup

1. Clone the repository
2. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Configure the environment variables by copying `.env.example` to `.env` and updating the values:
```bash
DATABASE_URL=postgresql://user:password@localhost:5432/gtfs_db
STATIC_GTFS_PATH=./data/static
REALTIME_GTFS_URL=your_realtime_gtfs_url
```

5. Create the PostgreSQL database:
```bash
createdb gtfs_db
```

## Usage

1. Start the API server:
```bash
python main.py
```

The server will start at `http://localhost:8000`

2. Available endpoints:

- `GET /` - Welcome message
- `GET /agencies` - List all transit agencies
- `GET /agencies/{agency_id}` - Get specific agency details
- `GET /agencies/{agency_id}/routes` - Get routes for a specific agency
- `GET /realtime/{agency_id}` - Get realtime updates for a specific agency

## Data Loading

To load initial agency data and GTFS data, use the provided utility functions in `gtfs_loader.py`:

```python
from database import SessionLocal
import gtfs_loader

db = SessionLocal()
# Load agencies from agencies.json
gtfs_loader.load_agencies(db)

# Download and load static GTFS data for an agency
gtfs_loader.download_and_load_static_gtfs(db, "agency_id")

# Fetch realtime updates
gtfs_loader.fetch_realtime_updates(db, "agency_id")
```

## Future Enhancements

- Data analysis and predictions
- More detailed API endpoints
- Performance optimizations
- Historical data analysis
- Service alerts integration

## License

MIT License 