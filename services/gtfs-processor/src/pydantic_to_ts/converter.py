import importlib
import inspect
import os
import typing
from enum import Enum
from pydantic import BaseModel
from pydantic.fields import FieldInfo
from beanie.odm.fields import PydanticObjectId
from datetime import datetime, date, time
from uuid import UUID
import sys

# For Pydantic V2 field inspection. PydanticUndefined is used for default values.
# from pydantic_core import PydanticUndefined
# Simpler check: field_info.is_required()

# Helper to get Python version for typing compatibility
PY_VERSION = sys.version_info[:2]  # (major, minor)


_TS_HELPER_TYPES = """
export type WithObjectId<T> = T & { _id: string };
"""


def _is_optional(field_info: FieldInfo) -> bool:
    """
    Checks if a Pydantic field is optional.
    In Pydantic V2, a field is optional if it's not required.
    A field is not required if it has a default value, a default_factory,
    or if it's explicitly Union[T, None] or Optional[T].
    The `is_required()` method simplifies this.
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

    if py_type is int or py_type is float:
        return "number"
    if py_type is str or py_type is UUID:
        return "string"
    if py_type is bool:
        return "boolean"
    if py_type is type(None):  # isinstance(py_type, type(None))
        return "null"
    if py_type is datetime or py_type is date or py_type is time:
        return "Date"
    if py_type is typing.Any:
        return "any"

    if isinstance(py_type, PydanticObjectId.__class__):
        return "string"

    if origin:  # Generic types
        if origin is list or origin is set:  # set also becomes array
            if args:
                return f"{_python_type_to_typescript_type(args[0], module_members)}[]"
            return "any[]"
        if origin is dict:
            if args and len(args) == 2:
                key_type = _python_type_to_typescript_type(args[0], module_members)
                value_type = _python_type_to_typescript_type(args[1], module_members)
                # TS Record keys must be string, number, or symbol. Pydantic keys are often strings.
                if key_type not in ["string", "number"]:
                    print(
                        f"Warning: Dictionary key type '{key_type}' may not be ideal for TS Record. Defaulting key to 'string'."
                    )
                    key_type = "string"
                return f"Record<{key_type}, {value_type}>"
            return "Record<string, any>"  # Or Record<any, any>
        if origin is tuple:
            if args:
                if len(args) == 2 and args[1] is Ellipsis:  # Tuple[X, ...]
                    return (
                        f"{_python_type_to_typescript_type(args[0], module_members)}[]"
                    )
                tuple_types = ", ".join(
                    [
                        _python_type_to_typescript_type(arg, module_members)
                        for arg in args
                    ]
                )
                return f"[{tuple_types}]"
            return "any[]"  # Empty tuple or unspecified

        if PY_VERSION >= (3, 10) and origin is typing.Union:  # Python 3.10+ | syntax
            # Handle Optional[T] which is Union[T, None]
            union_args = [arg for arg in args if arg is not type(None)]
            ts_types = [
                _python_type_to_typescript_type(arg, module_members)
                for arg in union_args
            ]
            if type(None) in args:
                ts_types.append("null")
            return " | ".join(
                sorted(list(set(ts_types)))
            )  # sorted and set for consistent order and no duplicates

        # For Python < 3.10, typing.Union is used explicitly
        if (
            PY_VERSION < (3, 10) and str(origin) == "typing.Union"
        ):  # Check string representation for older versions
            union_args = [arg for arg in args if arg is not type(None)]
            ts_types = [
                _python_type_to_typescript_type(arg, module_members)
                for arg in union_args
            ]
            if type(None) in args:  # type(None) is NoneType
                ts_types.append("null")
            return " | ".join(sorted(list(set(ts_types))))

        if origin is typing.Literal:
            literal_values = []
            for arg in args:
                if isinstance(arg, str):
                    literal_values.append(f'"{arg}"')
                elif isinstance(arg, (int, float, bool)):
                    literal_values.append(
                        str(arg).lower() if isinstance(arg, bool) else str(arg)
                    )
                else:  # Should not happen for valid Literal
                    literal_values.append("any")
            return " | ".join(literal_values)

    # Check for ForwardRef (string annotations)
    if isinstance(py_type, typing.ForwardRef):
        return py_type.__forward_arg__  # Use the string name directly

    # Check if it's a known Pydantic model or Enum from the module
    if inspect.isclass(py_type):
        if py_type.__name__ in module_members and (
            issubclass(py_type, BaseModel) or issubclass(py_type, Enum)
        ):
            return py_type.__name__

    # Default for unknown types
    print(
        f"Warning: Unknown Python type '{py_type}' (origin: {origin}, args: {args}). Mapping to 'any'."
    )
    return "any"


def _convert_pydantic_model_to_typescript(
    model_cls: typing.Type[BaseModel], module_members: dict
) -> str:
    """Converts a Pydantic model to a TypeScript interface."""
    ts_fields = []
    model_name = model_cls.__name__

    # Handle fields in dependency order if possible (not strictly necessary for TS interfaces)
    # For Pydantic V2
    if not hasattr(model_cls, "model_fields"):
        print(
            f"Warning: Model {model_name} does not have 'model_fields'. Skipping. (Possibly Pydantic V1?)"
        )
        return ""

    for field_name, field_info in model_cls.model_fields.items():
        ts_field_name = field_info.alias or field_name
        is_opt = _is_optional(field_info)

        # field_info.annotation should give the resolved type
        ts_type = _python_type_to_typescript_type(field_info.annotation, module_members)

        ts_fields.append(f"  {ts_field_name}{'?' if is_opt else ''}: {ts_type};")

    return f"export interface {model_name} {{\n" + "\n".join(ts_fields) + "\n}"


def _convert_enum_to_typescript(enum_cls: typing.Type[Enum]) -> str:
    """Converts a Python Enum to a TypeScript enum, preserving names."""
    enum_name = enum_cls.__name__
    ts_members = []
    for member in enum_cls:
        if isinstance(member.value, str):
            ts_members.append(f'  {member.name} = "{member.value}",')
        elif isinstance(member.value, (int, float)):
            ts_members.append(f"  {member.name} = {member.value},")
        else:
            # Fallback for other types, or raise error
            print(
                f"Warning: Enum {enum_name} member {member.name} has unsupported value type {type(member.value)}. Omitting value assignment."
            )
            ts_members.append(f"  {member.name},")

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

    # Collect all Pydantic models and Enums first to handle interdependencies by name
    # This also helps _python_type_to_typescript_type identify them.
    module_members = {}
    pydantic_models = []
    enums = []

    for name, obj in inspect.getmembers(module):
        if inspect.isclass(obj):
            module_members[name] = obj  # Store for type resolution
            if issubclass(obj, BaseModel) and obj is not BaseModel:
                pydantic_models.append(obj)
            elif issubclass(obj, Enum) and obj is not Enum:
                enums.append(obj)

    print(
        f"Found {len(pydantic_models)} Pydantic models and {len(enums)} Enums in module '{module_path}'."
    )

    # Sort by name for consistent output order (optional, but nice)
    pydantic_models.sort(key=lambda x: x.__name__)
    enums.sort(key=lambda x: x.__name__)

    # Generate TS for Enums first (often dependencies for models)
    for enum_cls in enums:
        ts_outputs.append(_convert_enum_to_typescript(enum_cls))

    # Generate TS for Pydantic Models
    for model_cls in pydantic_models:
        ts_outputs.append(
            _convert_pydantic_model_to_typescript(model_cls, module_members)
        )

    # Basic header
    header = "// Generated by pydantic_to_ts\n"
    header += f"// Python module: {module_path}\n"
    header += "// Timestamp: " + datetime.now().isoformat() + "\n\n"

    final_ts_code = (
        header
        + _TS_HELPER_TYPES
        + "\n\n"
        + "\n\n".join(filter(None, ts_outputs))
    )  # Filter out empty strings

    dirname = os.path.dirname(output_ts_file)
    if not os.path.exists(dirname):
        os.makedirs(dirname)

    try:
        with open(output_ts_file, "w", encoding="utf-8") as f:
            f.write(final_ts_code)
        print(f"TypeScript definitions generated successfully at '{output_ts_file}'")
    except IOError:
        print(f"Error: Could not write to output file '{output_ts_file}'.")
