from pydantic import BaseModel
from typing import Any, Dict, List, Union, get_origin, get_args
import sys
import os  # To check if terminal supports colors

# Define ANSI color codes
# Use standard codes that are widely supported
COLOR_RED = "\033[91m"  # Red for Model 1 values (removed/changed)
COLOR_GREEN = "\033[92m"  # Green for Model 2 values (added/changed)
COLOR_YELLOW = "\033[93m"  # Yellow for metadata (type mismatch, length mismatch)
COLOR_RESET = "\033[0m"  # Reset to default color


# Function to check if the terminal supports colors
def supports_color():
    """
    Returns True if the running system's terminal supports color.
    """
    plat = sys.platform
    supported_platform = plat != "Pocket PC" and (
        plat != "win32" or "ANSICON" in os.environ
    )
    # isatty is not always implemented, e.g. when piped
    is_a_tty = hasattr(sys.stdout, "isatty") and sys.stdout.isatty()
    return supported_platform and is_a_tty


def print_model_diff(
    model1: BaseModel,
    model2: BaseModel,
    indent: int = 0,
    file=sys.stdout,
    colorize: bool = True,
):
    """
    Compares two Pydantic models and prints their differences with optional coloring.

    Args:
        model1: The first Pydantic model.
        model2: The second Pydantic model.
        indent: The current indentation level (for recursive calls).
        file: The output stream (defaults to stdout).
        colorize: If True, use ANSI escape codes for colored output.
    """
    prefix = "  " * indent
    use_color = colorize and supports_color()

    def colored(text, color):
        if use_color:
            return f"{color}{text}{COLOR_RESET}"
        return text

    if not isinstance(model1, BaseModel) or not isinstance(model2, BaseModel):
        print(
            f"{prefix}{colored('Error: Both inputs must be Pydantic BaseModel instances.', COLOR_RED)}",
            file=file,
        )
        return

    if type(model1) != type(model2):
        print(
            f"{prefix}{colored('Type mismatch:', COLOR_YELLOW)} {type(model1).__name__} vs {type(model2).__name__}",
            file=file,
        )
        print(
            f"{prefix}  Model 1 data: {colored(model1.model_dump(), COLOR_RED)}",
            file=file,
        )
        print(
            f"{prefix}  Model 2 data: {colored(model2.model_dump(), COLOR_GREEN)}",
            file=file,
        )
        return

    model1_dict = model1.model_dump()
    model2_dict = model2.model_dump()

    all_keys = set(model1_dict.keys()) | set(model2_dict.keys())

    for key in all_keys:
        value1 = model1_dict.get(key)
        value2 = model2_dict.get(key)

        if value1 != value2:
            # Handle nested Pydantic models
            if isinstance(value1, BaseModel) and isinstance(value2, BaseModel):
                print(f"{prefix}Field '{key}':", file=file)
                print_model_diff(
                    value1, value2, indent + 1, file=file, colorize=colorize
                )
            # Handle lists (assuming lists of comparable items or models)
            elif isinstance(value1, list) and isinstance(value2, list):
                print(f"{prefix}Field '{key}' (List):", file=file)
                print_list_diff(
                    value1, value2, indent + 1, file=file, colorize=colorize
                )
            # Handle dictionaries (basic comparison for now)
            elif isinstance(value1, dict) and isinstance(value2, dict):
                if value1 != value2:  # Basic dictionary comparison
                    print(f"{prefix}Field '{key}' (Dict):", file=file)
                    print(f"{prefix}  Model 1: {colored(value1, COLOR_RED)}", file=file)
                    print(
                        f"{prefix}  Model 2: {colored(value2, COLOR_GREEN)}", file=file
                    )
            # Handle simple values
            else:
                print(f"{prefix}Field '{key}':", file=file)
                print(f"{prefix}  Model 1: {colored(value1, COLOR_RED)}", file=file)
                print(f"{prefix}  Model 2: {colored(value2, COLOR_GREEN)}", file=file)


def print_list_diff(
    list1: list, list2: list, indent: int = 0, file=sys.stdout, colorize: bool = True
):
    """
    Compares two lists and prints their differences with optional coloring.
    If elements are Pydantic models, it performs a recursive diff.
    """
    prefix = "  " * indent
    use_color = colorize and supports_color()

    def colored(text, color):
        if use_color:
            return f"{color}{text}{COLOR_RESET}"
        return text

    len1 = len(list1)
    len2 = len(list2)

    if len1 != len2:
        print(
            f"{prefix}{colored('Length mismatch:', COLOR_YELLOW)} {len1} vs {len2}",
            file=file,
        )

    min_len = min(len1, len2)

    for i in range(min_len):
        item1 = list1[i]
        item2 = list2[i]

        if item1 != item2:
            print(f"{prefix}Index {i}:", file=file)
            if isinstance(item1, BaseModel) and isinstance(item2, BaseModel):
                print_model_diff(item1, item2, indent + 1, file=file, colorize=colorize)
            else:
                print(f"{prefix}  Model 1: {colored(item1, COLOR_RED)}", file=file)
                print(f"{prefix}  Model 2: {colored(item2, COLOR_GREEN)}", file=file)

    # Handle elements present in one list but not the other
    if len1 > len2:
        print(f"{prefix}{colored('Extra elements in Model 1:', COLOR_RED)}", file=file)
        for i in range(min_len, len1):
            print(f"{prefix}  Index {i}: {colored(list1[i], COLOR_RED)}", file=file)
    elif len2 > len1:
        print(
            f"{prefix}{colored('Extra elements in Model 2:', COLOR_GREEN)}", file=file
        )
        for i in range(min_len, len2):
            print(f"{prefix}  Index {i}: {colored(list2[i], COLOR_GREEN)}", file=file)
