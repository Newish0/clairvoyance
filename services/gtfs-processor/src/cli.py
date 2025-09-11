import argparse
import asyncio
import json
import sys
from typing import List, Dict, Any, Union

from ingest_pipeline.static import run_gtfs_static_pipelines

# --- Helper Functions for Data Loading ---


def load_json_config(file_path: str) -> Dict[str, Any]:
    pass


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
        "--connection_string",
        type=str,
        default="mongodb://localhost:27017",
        help="MongoDB connection string.",
    )
    parser.add_argument(
        "--database_name",
        type=str,
        default="gtfs_data",
        help="Name of the MongoDB database.",
    )
    parser.add_argument(
        "--drop_collections",
        action="store_true",
        help="Drop existing collections before importing data.",
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

    # Mutually exclusive group for GTFS source
    gtfs_static_group = static_parser.add_mutually_exclusive_group(required=True)
    gtfs_static_group.add_argument(
        "--gtfs_config",
        type=str,
        help="Path to a JSON configuration file for GTFS static data.",
    )
    gtfs_static_group.add_argument(
        "--gtfs_url", type=str, help="URL to a GTFS static data zip file."
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

    # Mutually exclusive group for GTFS source
    gtfs_realtime_group = realtime_parser.add_mutually_exclusive_group(required=True)
    gtfs_realtime_group.add_argument(
        "--gtfs_config",
        type=str,
        help="Path to a JSON configuration file for GTFS realtime data.",
    )
    gtfs_realtime_group.add_argument(
        "--gtfs_urls",
        type=str,
        nargs="+",  # This allows it to accept one or more URLs
        help="One or more URLs to GTFS realtime data feeds.",
    )

    return parser.parse_args()


# --- Command Execution Logic ---


def process_static_data(
    connection_string: str,
    database_name: str,
    drop_collections: bool,
    agency_id: str,
    gtfs_config_path: Union[str, None],
    gtfs_url: Union[str, None],
) -> None:
    """
    Handles the 'static' command logic.
    """
    print("--- Running static data processing ---")
    print(f"  Connection String: {connection_string}")
    print(f"  Database Name: {database_name}")
    print(f"  Drop Collections: {drop_collections}")
    print(f"  Agency ID: {agency_id}")

    if gtfs_config_path:
        print(f"  GTFS Config (Static): {gtfs_config_path}")
        try:
            config_data = load_json_config(gtfs_config_path)
            print(f"  Loaded GTFS config: {config_data}")
            # TODO: Add your static data processing logic using config_data
            exit("No implementation for static GTFS config yet.")
        except (FileNotFoundError, json.JSONDecodeError) as e:
            print(f"Error processing static config: {e}", file=sys.stderr)
            sys.exit(1)
    elif gtfs_url:
        print(f"  GTFS URL (Static): {gtfs_url}")
        asyncio.run(
            run_gtfs_static_pipelines(
                connection_string=connection_string,
                database_name=database_name,
                drop_collections=drop_collections,
                agency_id=agency_id,
                gtfs_url=gtfs_url,
            )
        )

    # Placeholder for actual static data processing
    print("  Static data processed successfully (placeholder).")


def process_realtime_data(
    connection_string: str,
    database_name: str,
    drop_collections: bool,
    agency_id: str,
    gtfs_config_path: Union[str, None],
    gtfs_urls: Union[List[str], None],
) -> None:
    """
    Handles the 'realtime' command logic.
    """
    print("--- Running realtime data processing ---")
    print(f"  Connection String: {connection_string}")
    print(f"  Database Name: {database_name}")
    print(f"  Drop Collections: {drop_collections}")
    print(f"  Agency ID: {agency_id}")

    if gtfs_config_path:
        print(f"  GTFS Config (Realtime): {gtfs_config_path}")
        try:
            config_data = load_json_config(gtfs_config_path)
            print(f"  Loaded GTFS config: {config_data}")
            # TODO: Add your realtime data processing logic using config_data
            exit("No implementation for realtime GTFS config yet.")
        except (FileNotFoundError, json.JSONDecodeError) as e:
            print(f"Error processing realtime config: {e}", file=sys.stderr)
            sys.exit(1)
    elif gtfs_urls:
        print(f"  GTFS URLs (Realtime): {gtfs_urls}")
        # TODO: Add your realtime data processing logic using gtfs_urls
        exit("No implementation for realtime GTFS URLs yet.")

    # Placeholder for actual realtime data processing
    print("  Realtime data processed successfully (placeholder).")


def execute_command(args: argparse.Namespace) -> None:
    """
    Dispatches to the correct command processing function based on parsed arguments.
    """
    if args.command == "static":
        process_static_data(
            connection_string=args.connection_string,
            database_name=args.database_name,
            drop_collections=args.drop_collections,
            agency_id=args.agency_id,
            gtfs_config_path=args.gtfs_config,
            gtfs_url=args.gtfs_url,
        )
    elif args.command == "realtime":
        process_realtime_data(
            connection_string=args.connection_string,
            database_name=args.database_name,
            drop_collections=args.drop_collections,
            agency_id=args.agency_id,
            gtfs_config_path=args.gtfs_config,
            gtfs_urls=args.gtfs_urls,
        )
    else:
        # This case should ideally not be reached due to required=True on subparsers
        print(f"Error: Unknown command '{args.command}'", file=sys.stderr)
        sys.exit(1)


# --- Main Execution Block ---

if __name__ == "__main__":
    args = parse_arguments()
    execute_command(args)
