# GTFS API

A Python-based API for handling GTFS (General Transit Feed Specification) data, both static and realtime. This API allows you to store transit data in a PostgreSQL database and provides REST endpoints for accessing the data.

## Features

- Load and store static GTFS data
- Fetch and store realtime GTFS updates
- REST API endpoints for accessing transit data
- Support for multiple transit agencies
- PostgreSQL database storage
- Clean, modular architecture

## Project Structure

```
api/
├── app/
│   ├── core/           # Core configuration and database setup
│   │   ├── config.py
│   │   └── database.py
│   ├── models/         # Database models
│   │   └── models.py
│   ├── services/       # Business logic
│   │   └── gtfs_service.py
│   └── api/           # API routes and schemas
│       ├── routes.py
│       └── schemas.py
├── data/              # Data files
│   └── agencies.json
├── scripts/           # Database management scripts
│   ├── init_db.py
│   └── reset_db.py
├── .env              # Environment variables
├── requirements.txt   # Python dependencies
└── main.py           # Application entry point
```

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

4. Configure the environment variables by creating a `.env` file:
```bash
DATABASE_URL=postgresql://user:password@localhost:5432/gtfs_db
```

5. Create the PostgreSQL database:
```bash
createdb gtfs_db
```

6. Initialize the database:
```bash
# This will create tables and load initial agency data
python scripts/init_db.py
```

## Usage

1. Start the API server:
```bash
python main.py
```

The server will start at `http://localhost:8000`

2. Available endpoints:

- `GET /` - Welcome message and API version
- `GET /agencies` - List all transit agencies (with pagination)
- `GET /agencies/{agency_id}` - Get specific agency details
- `GET /agencies/{agency_id}/routes` - Get routes for a specific agency (with pagination)
- `GET /realtime/{agency_id}` - Get realtime updates for a specific agency (with pagination)
<!-- - `POST /agencies/{agency_id}/load-static` - Trigger loading of static GTFS data
- `POST /agencies/{agency_id}/load-realtime` - Trigger loading of realtime GTFS data -->

## Data Management

The project includes several utility scripts for managing data:

1. Initialize database and load agencies:
```bash
python scripts/init_db.py
```

2. Reset database (WARNING: This will delete all data):
```bash
python scripts/reset_db.py
```

3. Configure agencies by editing `data/agencies.json`:
```json
{
  "agencies": [
    {
      "id": "agency-id",
      "name": "Agency Name",
      "static_gtfs_url": "https://example.com/gtfs.zip",
      "realtime_gtfs_url": "https://example.com/gtfs-rt"
    }
  ]
}
```

## API Documentation

Once the server is running, visit:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## Development

The project follows a modular architecture:

- `app/core/`: Core configuration and database setup
- `app/models/`: SQLAlchemy models for database tables
- `app/services/`: Business logic for GTFS data handling
- `app/api/`: FastAPI routes and Pydantic schemas
- `scripts/`: Database management utilities
- `data/`: Configuration and data files

## Future Enhancements

- Data analysis and predictions
- More detailed API endpoints
- Performance optimizations
- Historical data analysis
- Service alerts integration
- Background tasks for periodic data updates
- Caching layer for frequently accessed data

## License

MIT License 