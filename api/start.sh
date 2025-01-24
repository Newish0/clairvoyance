#!/bin/bash

# Initialize the database
python scripts/init_db.py

# Load static GTFS data into DB
python scripts/init_gtfs.py

# Start the main API server
uvicorn main:app --host 0.0.0.0 --port 8000