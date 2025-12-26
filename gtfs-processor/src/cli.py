import argparse
import asyncio
import logging
import sys
from typing import List

# from ingest_pipeline.realize_instances import run_realize_instances_pipelines
# from ingest_pipeline.realtime import run_gtfs_realtime_pipelines
from ingest_pipeline.static import run_gtfs_static_pipelines

# --- Argument Parsing Logic ---


def parse_arguments() -> argparse.Namespace:
    """
    Parses command-line arguments using argparse.

    Returns:
        An argparse.Namespace object containing the parsed arguments.
    """
    parser = argparse.ArgumentParser(
        description="CLI tool for ingesting GTFS data.",
        formatter_class=argparse.RawTextHelpFormatter,  # For better help formatting
    )

    # Global arguments
    parser.add_argument(
        "--database_url",
        type=str,
        help="Connection string for the database to connect to. E.g. 'postgresql+asyncpg://transit:transit@localhost:5432/transit'",
    )
    parser.add_argument(
        "--delete_rows",
        action="store_true",
        help="Delete existing data in the database tables before ingesting new data.",
    )
    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Enable debug logging (verbose output).",
    )

    # Subparsers for different commands
    subparsers = parser.add_subparsers(
        dest="command",
        required=True,
        help="Available commands:\n  static - Process static GTFS data.\n  realtime - Process realtime GTFS data.",
    )

    # --- Static command ---
    static_parser = subparsers.add_parser("static", help="Process static GTFS data.")
    static_parser.add_argument(
        "--agency_id",
        type=str,
        required=True,
        help="Required agency ID for static data.",
    )

    static_parser.add_argument(
        "--gtfs_url",
        type=str,
        help="URL to a GTFS static data zip file.",
        required=True,
    )

    static_parser.add_argument(
        "--realize_instances",
        action="store_true",
        help="Realize trip instances from GTFS static data.",
    )

    # --- Realtime command ---
    realtime_parser = subparsers.add_parser(
        "realtime", help="Process realtime GTFS data."
    )
    realtime_parser.add_argument(
        "--agency_id",
        type=str,
        required=True,
        help="Required agency ID for realtime data.",
    )

    realtime_parser.add_argument(
        "--gtfs_urls",
        type=str,
        nargs="+",  # This allows it to accept one or more URLs
        help="One or more URLs to GTFS realtime data feeds.",
        required=True,
    )

    realtime_parser.add_argument(
        "--poll",
        type=int,
        default=0,
        help="Poll interval (in seconds) for GTFS realtime data. If 0, polling is disabled (runs once).",
    )

    # --- Realize Instances command ---
    realize_instances_parser = subparsers.add_parser(
        "realize_instances",
        aliases=["realize"],
        help="Realize trip instances from existing static GTFS data.",
    )
    realize_instances_parser.add_argument(
        "--agency_id",
        type=str,
        required=True,
        help="Required agency ID for realizing trip instances.",
    )
    realize_instances_parser.add_argument(
        "--min_date",
        type=str,
        default="00000101",
        help="Minimum date (YYYYMMDD) for trip instances to realize.",
    )
    realize_instances_parser.add_argument(
        "--max_date",
        type=str,
        default="99991231",
        help="Maximum date (YYYYMMDD) for trip instances to realize.",
    )

    return parser.parse_args()


# --- Command Execution Logic ---


def process_static_data(
    database_url: str,
    delete_rows: bool,
    agency_id: str,
    gtfs_url: str,
    realize_instances: bool,
    log_level: int,
) -> None:
    """
    Handles the 'static' command logic.
    """
    print("--- Running static data processing ---")
    print(f"  Database URL: {database_url}")
    print(f"  Delete Rows: {delete_rows}")
    print(f"  Agency ID: {agency_id}")
    print(f"  Realize Instances: {realize_instances}")
    print(f"  Log Level: {'DEBUG' if log_level == logging.DEBUG else 'INFO'}")

    print(f"  GTFS URL (Static): {gtfs_url}")
    asyncio.run(
        run_gtfs_static_pipelines(
            database_url=database_url,
            delete_rows=delete_rows,
            agency_id=agency_id,
            gtfs_url=gtfs_url,
            realize_instances=realize_instances,
            log_level=log_level,
        )
    )

    print("  Static data processed successfully.")


def process_realtime_data(
    database_url: str,
    delete_rows: bool,
    agency_id: str,
    gtfs_urls: List[str],
    poll: int,
    log_level: int,
) -> None:
    """
    Handles the 'realtime' command logic.
    """
    print("--- Running realtime data processing ---")
    print(f"  Database URL: {database_url}")
    print(f"  Delete Rows: {delete_rows}")
    print(f"  Log Level: {'DEBUG' if log_level == logging.DEBUG else 'INFO'}")

    print(f"  GTFS URLs (Realtime): {gtfs_urls}")
    # asyncio.run(
    #     run_gtfs_realtime_pipelines(
    #         connection_string=connection_string,
    #         database_name=database_name,
    #         drop_collections=drop_collections,
    #         agency_id=agency_id,
    #         gtfs_urls=gtfs_urls,
    #         poll=poll,
    #         log_level=log_level,
    #     )
    # )

    print("-" * 40)
    print("  Realtime data processed successfully.")


def execute_command(args: argparse.Namespace) -> None:
    """
    Dispatches to the correct command processing function based on parsed arguments.
    """
    # Set log level based on verbose flag
    log_level = logging.DEBUG if args.verbose else logging.INFO

    if args.command == "static":
        process_static_data(
            database_url=args.database_url,
            delete_rows=args.delete_rows,
            agency_id=args.agency_id,
            gtfs_url=args.gtfs_url,
            realize_instances=args.realize_instances,
            log_level=log_level,
        )
    elif args.command == "realtime":
        process_realtime_data(
            database_url=args.database_url,
            delete_rows=args.delete_rows,
            agency_id=args.agency_id,
            gtfs_urls=args.gtfs_urls,
            poll=args.poll,
            log_level=log_level,
        )
    elif args.command in ("realize_instances", "realize"):
        # asyncio.run(
        #     run_realize_instances_pipelines(
        #         connection_string=args.connection_string,
        #         database_name=args.database_name,
        #         drop_collections=args.drop_collections,
        #         agency_id=args.agency_id,
        #         min_date=args.min_date,
        #         max_date=args.max_date,
        #         log_level=log_level,
        #     )
        # )
        pass
    else:
        # This case should ideally not be reached due to required=True on subparsers
        print(f"Error: Unknown command '{args.command}'", file=sys.stderr)
        sys.exit(1)


# --- Main Execution Block ---

if __name__ == "__main__":
    args = parse_arguments()
    execute_command(args)
