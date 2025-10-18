"""
pydantic_to_ts.py

Generates TypeScript definitions from Pydantic (v2) models and Python Enums.

Usage:
    from pydantic_to_ts import generate_typescript_defs
    generate_typescript_defs("my_project.models", "./frontend/types.d.ts")

Notes:
- Designed for Pydantic v2 (uses model_fields).
- Maps beanie.odm.fields.PydanticObjectId -> string if available.
- Emits WithObjectId<T> helper and an option to mark Document-like models as T & { _id: string }.
"""

from __future__ import annotations

import importlib
import inspect
import json
import os
import re
import sys
import typing
from datetime import date, datetime, time
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

# Try to import Pydantic and Beanie PydanticObjectId if available
try:
    from pydantic import BaseModel
except Exception:
    BaseModel = None  # type: ignore

try:
    from beanie.odm.fields import PydanticObjectId  # type: ignore
except Exception:
    # Fallback sentinel — we'll also detect by name
    PydanticObjectId = None  # type: ignore

# Types for typing inspection
try:
    from typing import get_origin, get_args, Literal  # py3.8+ style
except Exception:
    # Fallback for older Python (shouldn't be needed in modern envs)
    from typing_extensions import get_origin, get_args, Literal  # type: ignore

# Regex for a valid JS identifier (simple)
_JS_IDENTIFIER_RE = re.compile(r"^[A-Za-z_]\w*$")

# Helper TypeScript snippet
_TS_HELPER_TYPES = """// Helper: attach Mongo/Object _id as string if desired
export type WithObjectId<T> = T & { _id: string };
"""


def _quote_field_if_needed(name: str) -> str:
    """Return field name, quoted if it's not a valid JS identifier."""
    if _JS_IDENTIFIER_RE.match(name):
        return name
    # Use json.dumps to correctly escape the name and produce a double-quoted string
    return json.dumps(name)


def _is_optional_field(field_info) -> bool:
    """
    Return True if the field should be optional in TypeScript.
    Fields with a default *but not Optional[...] annotation* are NOT optional.
    """
    try:
        # For Pydantic v2
        if hasattr(field_info, "is_required"):
            if field_info.is_required():
                return False
            # If it has a default but annotation is not Optional, treat as required
            ann = getattr(field_info, "annotation", None)
            origin = typing.get_origin(ann)
            if origin is typing.Union and type(None) in typing.get_args(ann):
                return True
            return False
        # For older compatibility
        if hasattr(field_info, "required"):
            return not bool(field_info.required)
    except Exception:
        pass
    return False


def _py_type_to_ts(
    py_type: Any, module_members: Dict[str, Any], seen: set[str] | None = None
) -> str:
    """
    Convert a Python-typing annotation to a TypeScript type string.
    - module_members: mapping of name->object for the processed module so we can map model names & enums.
    - seen: names seen so far to avoid recursion loops when mapping forward refs.
    """
    if seen is None:
        seen = set()

    origin = get_origin(py_type)
    args = get_args(py_type)

    # Handle Annotated[...] -> unwrap
    if origin is typing.Annotated:
        if args:
            return _py_type_to_ts(args[0], module_members, seen)
        return "any"

    # Direct primitives
    if py_type in (int, float):
        return "number"
    if py_type is str:
        return "string"
    if py_type is bool:
        return "boolean"
    if py_type is Any or py_type is typing.Any:
        return "any"
    if py_type is type(None):
        return "null"
    if py_type in (datetime, date, time):
        # Represent as Date in TS; applications can parse ISO strings to Date objects
        return "Date"

    # PydanticObjectId -> string: detection by identity or by name
    if PydanticObjectId is not None and py_type is PydanticObjectId:
        return "string"
    if getattr(py_type, "__name__", None) == "PydanticObjectId":
        return "string"

    # Generic containers
    if origin:
        # Lists / Sequence / Set -> array
        if origin in (list, List, typing.List, tuple, typing.Sequence):
            if args:
                # If it's a variable-length tuple like Tuple[T, ...] we treat as T[]
                if origin in (tuple,):
                    if len(args) == 2 and args[1] is Ellipsis:
                        return f"{_py_type_to_ts(args[0], module_members, seen)}[]"
                    # fixed-length tuple -> tuple type in TS
                    inner = ", ".join(
                        _py_type_to_ts(a, module_members, seen) for a in args
                    )
                    return f"[{inner}]"
                return f"{_py_type_to_ts(args[0], module_members, seen)}[]"
            return "any[]"

        # Set -> array (TS has Set but arrays are more common)
        if origin in (set, typing.Set):
            if args:
                return f"{_py_type_to_ts(args[0], module_members, seen)}[]"
            return "any[]"

        # Dict -> Record<K, V>
        if origin in (dict, typing.Dict, typing.Mapping):
            if args and len(args) == 2:
                k_ts = _py_type_to_ts(args[0], module_members, seen)
                v_ts = _py_type_to_ts(args[1], module_members, seen)
                # TS record keys must be string | number | symbol — default to string if not valid
                if k_ts not in ("string", "number") and not re.match(
                    r"^['\"`].+['\"`]$", k_ts
                ):
                    # Common case: Python keys are strings -> ensure string
                    k_ts = "string"
                return f"Record<{k_ts}, {v_ts}>"
            return "Record<string, any>"

        # Union -> a | b | null
        is_union = (
            origin is typing.Union
            or getattr(origin, "__origin__", None) is typing.Union
        )
        # In Py3.10, | union creates types.UnionType but get_origin handles it
        if is_union:
            union_args = args
            # Flatten nested unions and map
            mapped = []
            contains_none = False
            for a in union_args:
                if a is type(None):
                    contains_none = True
                    continue
                mapped.append(_py_type_to_ts(a, module_members, seen))
            # Remove duplicates
            mapped = list(dict.fromkeys(mapped))
            if contains_none:
                mapped.append("null")
            if not mapped:
                return "any"
            return " | ".join(mapped)

        # Literal -> 'a' | 'b' | 3
        try:
            from typing import Literal as TypingLiteral
        except Exception:
            TypingLiteral = None

        if (
            getattr(origin, "__name__", None) == "Literal"
            or origin is typing.Literal
            or origin is Literal
        ):
            literal_values = []
            for lit in args:
                if isinstance(lit, str):
                    literal_values.append(json.dumps(lit))
                elif isinstance(lit, bool):
                    literal_values.append(str(lit).lower())
                elif isinstance(lit, (int, float)):
                    literal_values.append(str(lit))
                else:
                    # Unexpected literal
                    literal_values.append(json.dumps(str(lit)))
            # unique + stable
            literal_values = list(dict.fromkeys(literal_values))
            if not literal_values:
                return "never"
            return " | ".join(literal_values)

    # ForwardRef (string) or string annotations
    if isinstance(py_type, str):
        # e.g. "OtherModel" -> just return OtherModel
        return py_type

    # typing.ForwardRef in some versions
    if hasattr(py_type, "__forward_arg__"):
        return py_type.__forward_arg__

    # If it's a class, maybe it's a Pydantic model or an Enum
    if inspect.isclass(py_type):
        # If it's defined in the same module we're processing, reference by name
        name = py_type.__name__
        # Avoid infinite recursion: if we've already emitted the same name, use the name
        if name in seen:
            return name
        # If it's a BaseModel subclass
        try:
            if BaseModel is not None and issubclass(py_type, BaseModel):
                return name
        except Exception:
            pass
        # If it's an Enum subclass
        try:
            if issubclass(py_type, Enum):
                # Map to enum name (we'll emit the enum separately)
                return name
        except Exception:
            pass
        # If it's built-in class we didn't map earlier, try to map some common mappings
        UUID = getattr(typing, "UUID", None)
        if py_type is UUID:
            return "string"

    # Fallback
    type_repr = getattr(py_type, "__name__", str(py_type))
    print(f"Warning: Unknown Python type '{type_repr}'; mapping to 'any'.")
    return "any"


def _convert_enum_to_ts(enum_cls: type[Enum]) -> str:
    """Convert Python Enum to TypeScript enum preserving values (string/number)."""
    name = enum_cls.__name__
    members = []
    for member in enum_cls:
        val = member.value
        if isinstance(val, str):
            members.append(f"  {member.name} = {json.dumps(val)},")
        elif isinstance(val, (int, float)):
            members.append(f"  {member.name} = {val},")
        else:
            # Complex value; fallback to stringified value
            print(
                f"Warning: Enum {name}.{member.name} value type {type(val)}; stringifying."
            )
            members.append(f"  {member.name} = {json.dumps(str(val))},")
    body = "\n".join(members)
    return f"export enum {name} {{\n{body}\n}}"


def _convert_model_to_ts(
    model_cls: type, module_members: Dict[str, Any], mark_with_object_id: bool
) -> str:
    """Convert a Pydantic BaseModel/Beanie Document to a TypeScript interface."""
    name = model_cls.__name__

    # Pydantic v2: model_fields holds FieldInfo-ish objects keyed by name
    if not hasattr(model_cls, "model_fields"):
        print(
            f"Skipping {name}: does not appear to be a Pydantic v2 BaseModel (missing model_fields)."
        )
        return ""

    lines: List[str] = []
    # Use model_fields to get annotations and alias info
    for py_field_name, field_info in model_cls.model_fields.items():
        # field_info is a ModelField (Pydantic) or similar; get alias if present
        alias = getattr(field_info, "alias", None) or py_field_name
        ts_name = _quote_field_if_needed(alias)
        is_opt = _is_optional_field(field_info)
        annotation = getattr(field_info, "annotation", None)
        # Some Pydantic fields supply 'annotation' as typing.Any if absent
        if annotation is None:
            annotation = Any
        ts_type = _py_type_to_ts(annotation, module_members, seen={name})
        if is_opt and "null" not in ts_type:
            ts_type = f"{ts_type} | null"
        lines.append(f"  {ts_name}: {ts_type};")

    interface_body = "\n".join(lines)
    if mark_with_object_id:
        # We'll export the base interface and a WithObjectId variant
        return f"export interface {name} {{\n{interface_body}\n}}\n\nexport type {name}WithId = WithObjectId<{name}>;"
    else:
        return f"export interface {name} {{\n{interface_body}\n}}"


def generate_typescript_defs(
    module_path: str, output_ts_file: str, mark_documents_with_id: bool = True
) -> None:
    """
    Generate TypeScript definitions for Pydantic models and Enums found in module.

    :param module_path: dot path to module, e.g. "my_app.models"
    :param output_ts_file: where to write the resulting .ts/.d.ts file
    :param mark_documents_with_id: if True, add WithObjectId<T> helper types for classes that are Beanie Document subclasses.
    """
    try:
        module = importlib.import_module(module_path)
    except Exception as exc:
        print(f"Error importing module '{module_path}': {exc}")
        return

    module_members: Dict[str, Any] = {}
    pyd_models: List[type] = []
    enums: List[type] = []
    documents: List[type] = []

    # Gather members from the module
    for name, obj in inspect.getmembers(module):
        if inspect.isclass(obj):
            module_members[name] = obj

    # Classify
    for name, obj in list(module_members.items()):
        try:
            if (
                BaseModel is not None
                and inspect.isclass(obj)
                and issubclass(obj, BaseModel)
                and obj is not BaseModel
            ):
                pyd_models.append(obj)
        except Exception:
            pass
        try:
            if inspect.isclass(obj) and issubclass(obj, Enum) and obj is not Enum:
                enums.append(obj)
        except Exception:
            pass

        # Detect Beanie Document subclasses heuristically by name or base class if Beanie is available
        try:
            # If object has 'Settings' and 'Settings.name' it's probably a Beanie Document, but this is heuristic
            if (
                inspect.isclass(obj)
                and hasattr(obj, "Settings")
                and hasattr(obj, "model_fields")
            ):
                # We will treat any BaseModel subclass with Settings as a "document"
                documents.append(obj)
        except Exception:
            pass

    # Sort for stable output
    enums.sort(key=lambda x: x.__name__)
    pyd_models.sort(key=lambda x: x.__name__)

    # Prepare output blocks
    blocks: List[str] = []

    header = (
        f"// Generated by pydantic_to_ts\n"
        f"// Source module: {module.__name__}\n"
        f"// Generated at: {datetime.now().isoformat()}\n\n"
    )
    blocks.append(header)
    blocks.append(_TS_HELPER_TYPES)

    # Emit enums first (models may reference them)
    for e in enums:
        blocks.append(_convert_enum_to_ts(e))

    # Emit models
    for m in pyd_models:
        mark_id = False
        if mark_documents_with_id:
            # Determine if this model is a Document-like model (heuristic: Settings attr & Settings.name)
            if hasattr(m, "Settings") and getattr(m.Settings, "name", None):
                mark_id = True
        blocks.append(_convert_model_to_ts(m, module_members, mark_id))

    final_code = "\n\n".join(filter(None, blocks)) + "\n"

    # Ensure output directory exists
    out_dir = os.path.dirname(output_ts_file)
    if out_dir and not os.path.exists(out_dir):
        os.makedirs(out_dir, exist_ok=True)

    try:
        with open(output_ts_file, "w", encoding="utf-8") as f:
            f.write(final_code)
        print(f"Wrote TypeScript definitions to: {output_ts_file}")
    except Exception as exc:
        print(f"Failed to write output file: {exc}")


# If run as script -> simple CLI
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Generate TypeScript defs from Pydantic v2 models."
    )
    parser.add_argument(
        "module", help="Python module path (dot-separated), e.g. 'myapp.models'"
    )
    parser.add_argument(
        "out", help="Output TypeScript file path, e.g. ./src/types.d.ts"
    )
    parser.add_argument(
        "--no-id",
        action="store_true",
        help="Do not add WithObjectId helper or WithId types for Document models.",
    )
    args = parser.parse_args()

    generate_typescript_defs(
        args.module, args.out, mark_documents_with_id=not args.no_id
    )
