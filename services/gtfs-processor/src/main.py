
import asyncio
import datetime
import os
from typing import List
import zipfile
import motor.motor_asyncio
# from parsing import GTFSParser
from parsing.gtfs_reader import GTFSReader
from domain import ScheduledTrip

# --- Configuration ---
MONGO_CONNECTION_STRING = "mongodb://localhost:27017" # Replace with your MongoDB connection string
DATABASE_NAME = "gtfs_data"
GTFS_ZIP_FILE = 'gtfs_test.zip' # Replace with your GTFS file path



# --- Helper to create a dummy GTFS zip ---
def create_dummy_gtfs(zip_path: str, date_str: str = "20231027", tz: str = "America/New_York"):
    print(f"Creating dummy GTFS file: {zip_path} for date {date_str} TZ {tz}")
    # Ensure directory exists
    os.makedirs(os.path.dirname(zip_path) or '.', exist_ok=True)
    # Get date object and weekday
    target_date = datetime.datetime.strptime(date_str, "%Y%m%d").date()
    weekday = target_date.strftime('%A').lower() # e.g., 'friday'
    calendar_line = f"S1,{weekday=='monday'},{weekday=='tuesday'},{weekday=='wednesday'},{weekday=='thursday'},{weekday=='friday'},{weekday=='saturday'},{weekday=='sunday'},{target_date.strftime('%Y%m')+'01'},{target_date.strftime('%Y%m')+'28'}"

    try:
        with zipfile.ZipFile(zip_path, 'w') as zf:
             zf.writestr('agency.txt',
                         'agency_id,agency_name,agency_url,agency_timezone,agency_lang\n'
                         f'AG,"Test Agency","http://example.com","{tz}","en"\n')
             zf.writestr('routes.txt',
                         'route_id,route_short_name,route_long_name,route_type\n'
                         'R1,"1","Main St",3\n') # Route Type 3 = Bus
             zf.writestr('trips.txt',
                         'route_id,service_id,trip_id,trip_headsign,direction_id,shape_id\n'
                         'R1,S1,T1_WKDAY_0800,"Downtown",0,\n'
                         'R1,S1,T2_WKDAY_0900,"Uptown",1,\n')
             zf.writestr('stop_times.txt',
                         'trip_id,arrival_time,departure_time,stop_id,stop_sequence,pickup_type,drop_off_type\n'
                         'T1_WKDAY_0800,08:00:00,08:00:00,StopA,1,0,0\n'
                         'T1_WKDAY_0800,08:05:00,08:05:30,StopB,2,0,0\n'
                         'T1_WKDAY_0800,08:10:00,08:10:00,StopC,3,0,0\n'
                         'T2_WKDAY_0900,09:00:00,09:00:00,StopD,1,0,0\n'
                         'T2_WKDAY_0900,09:08:00,09:08:00,StopB,2,0,0\n') # T2 also stops at B
             zf.writestr('stops.txt',
                         'stop_id,stop_name,stop_lat,stop_lon\n'
                         'StopA,"Stop A",40.71, -74.00\n'
                         'StopB,"Stop B",40.72, -74.01\n'
                         'StopC,"Stop C",40.73, -74.02\n'
                         'StopD,"Stop D",40.74, -74.03\n')
             zf.writestr('calendar.txt',
                         'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\n'
                         + calendar_line + '\n')
             # Optional: Add calendar_dates.txt for exceptions
             # zf.writestr('calendar_dates.txt', 'service_id,date,exception_type\n')

    except Exception as e:
        print(f"Error creating dummy GTFS: {e}")
        raise

# --- Main Execution ---
async def main():
    # --- Setup ---
    target_date = datetime.date(2023, 10, 27) # Friday
    target_date_str = target_date.strftime('%Y%m%d')
    # create_dummy_gtfs(GTFS_ZIP_FILE, target_date_str, "America/New_York")

    reader = GTFSReader()

    print(f"\n--- Parsing GTFS ---")
    parsed_gtfs = reader.parse("bctransit_gtfs.zip")

    print(f"\n--- Generating Scheduled Trips ---")
    domain_trips: List[ScheduledTrip] = parsed_gtfs.generate_scheduled_trips()
    print(domain_trips)


if __name__ == "__main__":
    asyncio.run(main())