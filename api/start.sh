#!/bin/bash

# Initialize the database
python scripts/init_db.py

# Start the realtime updates process in the background
python scripts/start_realtime_updates.py &

# Start the main API server
uvicorn main:app --host 0.0.0.0 --port 8000