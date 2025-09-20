import importlib
import inspect
import os
import typing
import types  # Added for types.UnionType
from enum import Enum
from pydantic import BaseModel
from pydantic.fields import FieldInfo
from beanie.odm.fields import PydanticObjectId
from datetime import datetime, date, time
from uuid import UUID
import sys
import json  # For string escaping if needed, though not heavily used here

# Helper to get Python version for typing compatibility
PY_VERSION = sys.version_info[:2]  # (major, minor)


_TS_HELPER_TYPES = """
export type WithObjectId<T> = T & { _id: string };
"""


def _is_optional(field_info: FieldInfo) -> bool:
    """
    Checks if a Pydantic field is optional.
    In Pydantic V2, a field is optional if it's not required.
    """
    return not field_info.is_required()


def _python_type_to_typescript_type(py_type: any, module_members: dict) -> str:
    """
    Converts a Python type hint to its TypeScript equivalent.
    `module_members` is a dictionary of names to objects in the processed module,
    used to identify if a type is a known Pydantic model or Enum from that module.
    """
    origin = typing.get_origin(py_type)
    args = typing.get_args(py_type)

    # 1. Handle Annotated: unwrap to get the base type
    if origin is typing.Annotated:
        return _python_type_to_typescript_type(args[0], module_members)

    # 2. Basic Python types to TypeScript
    if py_type is int or py_type is float:
        return "number"
    if py_type is str:  # Keep str separate from UUID for clarity
        return "string"
    if py_type is UUID:  # UUID becomes string
        return "string"
    if py_type is bool:
        return "boolean"
    if py_type is type(None):
        return "null"
    if py_type is datetime or py_type is date or py_type is time:
        return "Date"
    if py_type is typing.Any:
        return "any"

    # 3. Specific known types like PydanticObjectId
    if py_type is PydanticObjectId:  # Corrected check
        return "string"

    # 4. Generic types (List, Dict, Union, Literal, etc.)
    if origin:
        if origin is list or origin is set:  # set also becomes array
            if args:
                return f"{_python_type_to_typescript_type(args[0], module_members)}[]"
            return "any[]"
        if origin is dict:
            if args and len(args) == 2:
                key_type_py = args[0]
                value_type_py = args[1]

                ts_key_type_str = _python_type_to_typescript_type(
                    key_type_py, module_members
                )
                ts_value_type_str = _python_type_to_typescript_type(
                    value_type_py, module_members
                )

                # TS Record keys must be string, number, or symbol.
                # If the Python key type translates to something else (e.g., an interface name for an Enum),
                # default to 'string' as Pydantic dict keys are typically strings upon serialization.
                if ts_key_type_str not in ["string", "number"] and not (
                    '"' in ts_key_type_str
                    or "'" in ts_key_type_str
                    or "`" in ts_key_type_str
                ):  # Crude check for string/number literals
                    # This check means if ts_key_type_str is "MyEnum", it will be changed to "string".
                    # If it was Literal['A' | 'B'], it would pass.
                    actual_key_type_repr = getattr(
                        key_type_py, "__name__", str(key_type_py)
                    )
                    print(
                        f"Warning: Dictionary key type '{actual_key_type_repr}' (resolved to TS '{ts_key_type_str}') "
                        f"is not directly usable as a TS Record key. Defaulting key to 'string'."
                    )
                    ts_key_type_str = "string"
                return f"Record<{ts_key_type_str}, {ts_value_type_str}>"
            return "Record<string, any>"
        if origin is tuple:
            if args:
                if len(args) == 2 and args[1] is Ellipsis:  # Tuple[X, ...]
                    return (
                        f"{_python_type_to_typescript_type(args[0], module_members)}[]"
                    )

                tuple_member_ts_types = [
                    _python_type_to_typescript_type(arg, module_members) for arg in args
                ]
                return f"[{', '.join(tuple_member_ts_types)}]"
            return "any[]"  # Empty tuple or unspecified

        # Improved Union handling
        is_python_union = origin is typing.Union or (
            PY_VERSION >= (3, 10) and origin is types.UnionType
        )
        if is_python_union:
            non_none_args = [arg for arg in args if arg is not type(None)]

            if not non_none_args:  # Only NoneType in Union (e.g. Union[None])
                return "null"

            ts_types_for_union = [
                _python_type_to_typescript_type(arg, module_members)
                for arg in non_none_args
            ]

            if type(None) in args:  # If original Union included NoneType
                if (
                    "null" not in ts_types_for_union
                ):  # Avoid duplicates like "string | null | null"
                    ts_types_for_union.append("null")

            # Remove duplicates and sort for consistent output
            unique_sorted_ts_types = sorted(list(set(ts_types_for_union)))

            if (
                not unique_sorted_ts_types
            ):  # Should not happen if non_none_args had items
                return "any"  # Fallback

            return " | ".join(unique_sorted_ts_types)

        if origin is typing.Literal:
            literal_values_ts = []
            for arg_literal in args:
                if isinstance(arg_literal, str):
                    # Use json.dumps to correctly escape strings for TypeScript
                    literal_values_ts.append(json.dumps(arg_literal))
                elif isinstance(arg_literal, (int, float)):
                    literal_values_ts.append(str(arg_literal))
                elif isinstance(arg_literal, bool):
                    literal_values_ts.append(str(arg_literal).lower())
                else:
                    print(
                        f"Warning: Unsupported Literal value type {type(arg_literal)} for value '{arg_literal}'. Mapping to 'any' for this item."
                    )
                    literal_values_ts.append("any")

            if not literal_values_ts:
                return "never"  # An empty set of literals is `never` in TS

            # Sort for consistent output, remove duplicates
            unique_sorted_literals = sorted(list(set(literal_values_ts)))
            return " | ".join(unique_sorted_literals)

    # 5. Handle ForwardRef (string type hints)
    if isinstance(py_type, typing.ForwardRef):
        # For TypeScript, using the forward reference name directly is usually fine,
        # as TS can resolve named types defined later or in other files (if imported).
        return py_type.__forward_arg__

    # 6. Handle direct class types (Pydantic Models, Enums from the module)
    if inspect.isclass(py_type):
        # This is the key fix: ensure it's a model/enum from the *processed module*
        # by checking identity against `module_members`.
        if py_type.__name__ in module_members and py_type is module_members.get(
            py_type.__name__
        ):  # Ensure it's the exact object
            if issubclass(py_type, BaseModel):
                return py_type.__name__  # Use Model name for TS Interface
            if issubclass(py_type, Enum):
                return py_type.__name__  # Use Enum name for TS Enum

    # 7. Default for unknown complex types
    type_repr = getattr(py_type, "__name__", str(py_type))  # Get a representative name
    print(
        f"Warning: Unknown Python type '{type_repr}' (Origin: {origin}, Args: {args}). Mapping to 'any'."
    )
    return "any"


def _convert_pydantic_model_to_typescript(
    model_cls: type[BaseModel], module_members: dict
) -> str:
    """Converts a Pydantic model to a TypeScript interface."""
    ts_fields = []
    model_name = model_cls.__name__

    if not hasattr(model_cls, "model_fields"):  # Pydantic V2 check
        print(
            f"Warning: Model {model_name} does not have 'model_fields'. Skipping. "
            f"(This suggests it might be a Pydantic V1 model or not a Pydantic model.)"
        )
        return ""

    for field_name, field_info in model_cls.model_fields.items():
        # Use serialization alias if present, otherwise Python field name
        ts_field_name = field_info.alias or field_name
        is_opt = _is_optional(
            field_info
        )  # Pydantic V2: checks field_info.is_required()

        # field_info.annotation should give the resolved type hint
        ts_type = _python_type_to_typescript_type(field_info.annotation, module_members)

        # Ensure TS field name is a valid identifier or quoted if needed
        # (though typically Pydantic aliases are valid JS identifiers)
        # For simplicity, this example assumes ts_field_name is valid.
        # Production tools might add quoting for names with special characters.

        ts_fields.append(f"  {ts_field_name}{'?' if is_opt else ''}: {ts_type};")

    return f"export interface {model_name} {{\n" + "\n".join(ts_fields) + "\n}"


def _convert_enum_to_typescript(enum_cls: type[Enum]) -> str:
    """Converts a Python Enum to a TypeScript enum, preserving names and string/number values."""
    enum_name = enum_cls.__name__
    ts_members = []
    for member in enum_cls:
        if isinstance(member.value, str):
            # Use json.dumps to correctly escape string values for TS
            ts_members.append(f"  {member.name} = {json.dumps(member.value)},")
        elif isinstance(member.value, (int, float)):
            ts_members.append(f"  {member.name} = {member.value},")
        else:
            # Fallback for other complex value types (e.g., tuples, objects)
            # For TS enums, values are typically strings or numbers.
            # Emitting just the name might be best if value is complex, or warning.
            print(
                f"Warning: Enum '{enum_name}' member '{member.name}' has a complex value type: {type(member.value)}. "
                f"In TypeScript, enum members are typically strings or numbers. "
                f"Assigning its string representation: {json.dumps(str(member.value))}."
            )
            ts_members.append(f"  {member.name} = {json.dumps(str(member.value))},")

    return f"export enum {enum_name} {{\n" + "\n".join(ts_members) + "\n}"


def generate_typescript_defs(module_path: str, output_ts_file: str) -> None:
    """
    Generates TypeScript definitions from Pydantic models and Enums in a Python module.

    :param module_path: Dot-separated path to the Python module (e.g., "my_project.api.models").
    :param output_ts_file: Path to the output TypeScript file (e.g., "./frontend/apiTypes.ts").
    """
    try:
        module = importlib.import_module(module_path)
    except ImportError:
        print(f"Error: Could not import module '{module_path}'.")
        return

    ts_outputs = []

    # Collect all Pydantic models and Enums first.
    # `module_members` will store all class objects found in the module's namespace,
    # which is used by `_python_type_to_typescript_type` to resolve named types.
    module_members = {}
    pydantic_models = []
    enums = []

    for name, obj in inspect.getmembers(module):
        if inspect.isclass(obj):
            module_members[name] = obj  # Store for type resolution
            # We only want to generate definitions for models/enums defined in *this* module,
            # or at least those explicitly chosen. For now, collect all found.
            # A common refinement is to check `obj.__module__ == module.__name__`.
            if issubclass(obj, BaseModel) and obj is not BaseModel:
                pydantic_models.append(obj)
            elif issubclass(obj, Enum) and obj is not Enum:
                enums.append(obj)

    print(
        f"Found {len(pydantic_models)} Pydantic models and {len(enums)} Enums in module '{module_path}' for potential conversion."
    )

    # Sort by name for consistent output order (optional, but helpful for diffs)
    # For TS, order of interface/enum definition doesn't usually matter as much as for Zod schemas
    # due to TS's type hoisting and resolution capabilities.
    pydantic_models.sort(key=lambda x: x.__name__)
    enums.sort(key=lambda x: x.__name__)

    # Generate TS for Enums first (often dependencies for models, good practice)
    for enum_cls in enums:
        ts_outputs.append(_convert_enum_to_typescript(enum_cls))

    # Generate TS for Pydantic Models
    for model_cls in pydantic_models:
        ts_outputs.append(
            _convert_pydantic_model_to_typescript(model_cls, module_members)
        )

    # Basic header
    header_comments = (
        f"// Generated by pydantic-to-ts-converter\n"
        f"// From Pydantic models in Python module: {module.__name__} (path: {module_path})\n"
        f"// Timestamp: {datetime.now().isoformat()}\n\n"
    )

    final_ts_code = (
        header_comments
        + _TS_HELPER_TYPES  # If you have any global helper types
        + "\n\n"
        + "\n\n".join(
            filter(None, ts_outputs)
        )  # Filter out any empty strings from conversions
    )

    output_directory = os.path.dirname(output_ts_file)
    if output_directory and not os.path.exists(output_directory):
        os.makedirs(output_directory)
        print(f"Created output directory: {output_directory}")

    try:
        with open(output_ts_file, "w", encoding="utf-8") as f:
            f.write(final_ts_code)
        print(f"TypeScript definitions generated successfully at '{output_ts_file}'")
    except IOError as e:
        print(f"Error: Could not write to output file '{output_ts_file}': {e}")
