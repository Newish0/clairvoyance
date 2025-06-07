import json
import os
import sys
import argparse
import logging
import asyncio
from pathlib import Path
from typing import Dict, List, Any, Optional
from jsonschema import validate, ValidationError, Draft7Validator


# JSON Schema for validation
CONFIG_SCHEMA = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "Agency GTFS Source Configuration",
    "description": "Configuration schema for GTFS static and realtime data sources for transit agencies",
    "type": "object",
    "properties": {
        "agencies": {
            "type": "array",
            "description": "List of transit agencies",
            "items": {
                "type": "object",
                "properties": {
                    "id": {
                        "type": "string",
                        "description": "Unique identifier for the agency",
                        "minLength": 1,
                    },
                    "name": {
                        "type": "string",
                        "description": "Human-readable name of the agency",
                        "minLength": 1,
                    },
                    "static": {
                        "type": "object",
                        "description": "Static GTFS data source (URL or file path)",
                        "oneOf": [
                            {
                                "properties": {
                                    "url": {
                                        "type": "string",
                                        "description": "URL to download static GTFS data",
                                        "format": "uri",
                                        "pattern": "^https?://",
                                    }
                                },
                                "required": ["url"],
                                "additionalProperties": False,
                            },
                            {
                                "properties": {
                                    "file_path": {
                                        "type": "string",
                                        "description": "Local file path to static GTFS data (ZIP file)",
                                        "minLength": 1,
                                    }
                                },
                                "required": ["file_path"],
                                "additionalProperties": False,
                            },
                        ],
                    },
                    "realtime": {
                        "type": "array",
                        "description": "List of GTFS realtime data sources for this agency",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {
                                    "type": "string",
                                    "description": "Name/type of the data source",
                                    "minLength": 1,
                                },
                                "url": {
                                    "type": "string",
                                    "description": "URL endpoint for the GTFS realtime feed",
                                    "format": "uri",
                                    "pattern": "^https?://",
                                },
                                "enabled": {
                                    "type": "boolean",
                                    "description": "Whether this source is enabled",
                                    "default": True,
                                },
                            },
                            "required": ["name", "url"],
                            "additionalProperties": False,
                        },
                        "minItems": 1,
                    },
                },
                "required": ["id", "name", "static"],
                "additionalProperties": False,
            },
            "minItems": 1,
        }
    },
    "required": ["agencies"],
    "additionalProperties": False,
}


class ConfigurationError(Exception):
    """Custom exception for configuration-related errors."""

    pass


def load_config(config_path: Optional[str] = None) -> Dict[str, Any]:
    """
    Load and validate configuration from JSON file.

    Args:
        config_path: Path to configuration file. If None, looks for 'gtfs_config.json'
                    in the current directory.

    Returns:
        Dictionary containing the validated configuration.

    Raises:
        ConfigurationError: If configuration file is not found, invalid JSON,
                           or doesn't match schema.
    """
    # Determine config file path
    if config_path is None:
        # Look for gtfs_config.json in current directory
        config_path = Path.cwd() / "gtfs_config.json"
    else:
        config_path = Path(config_path)

    # Check if config file exists
    if not config_path.exists():
        raise ConfigurationError(f"Configuration file not found: {config_path}")

    # Load JSON file
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            config_data = json.load(f)
    except json.JSONDecodeError as e:
        raise ConfigurationError(f"Invalid JSON in configuration file: {e}")
    except Exception as e:
        raise ConfigurationError(f"Error reading configuration file: {e}")

    # Validate against schema
    try:
        validate(instance=config_data, schema=CONFIG_SCHEMA)
    except ValidationError as e:
        # Provide more detailed error information
        error_path = (
            " -> ".join(str(p) for p in e.absolute_path) if e.absolute_path else "root"
        )
        raise ConfigurationError(
            f"Configuration validation error at {error_path}: {e.message}"
        )

    return config_data


def get_all_realtime_sources(config: Dict[str, Any]) -> List[Dict[str, str]]:
    """
    Extract all enabled realtime sources from configuration.

    Args:
        config: Validated configuration dictionary.

    Returns:
        List of dictionaries with 'url', 'name', and 'agency_id' keys.
    """
    sources = []

    for agency in config["agencies"]:
        agency_id = agency["id"]
        agency_name = agency["name"]

        for source in agency["realtime"]:
            # Skip disabled sources
            if not source.get("enabled", True):
                continue

            sources.append(
                {
                    "url": source["url"],
                    "name": source["name"],
                    "agency_id": agency_id,
                    "agency_name": agency_name,
                }
            )

    return sources


def get_static_gtfs_info(
    config: Dict[str, Any], agency_id: str
) -> Optional[Dict[str, str]]:
    """
    Get static GTFS information for a specific agency.

    Args:
        config: Validated configuration dictionary.
        agency_id: ID of the agency to get static GTFS info for.

    Returns:
        Dictionary with either 'url' or 'file_path' key, or None if not configured.

    Raises:
        ConfigurationError: If agency_id is not found.
    """
    for agency in config["agencies"]:
        if agency["id"] == agency_id:
            return agency.get("static")

    raise ConfigurationError(f"Agency '{agency_id}' not found in configuration")
