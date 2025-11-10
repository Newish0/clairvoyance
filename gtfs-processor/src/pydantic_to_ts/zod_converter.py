import importlib
import inspect
import os
import typing
import types  # Added for types.UnionType
from enum import Enum
from pydantic import BaseModel
from pydantic.fields import FieldInfo
from beanie.odm.fields import PydanticObjectId  # Added as per user's context
from datetime import datetime, date, time
from uuid import UUID
import sys
import json  # For safely embedding strings in JS/TS code
from typing import Callable  # For Callable type hint

# Helper to get Python version for typing compatibility
PY_VERSION = sys.version_info[:2]

_ZOD_HEADER_IMPORTS = """import { z } from 'zod';

// Note: `PydanticObjectId` (from beanie.odm.fields) is mapped to `z.string()`. 
// If you prefer a branded type for ObjectId for more type safety in TypeScript:
// export type ObjectIdString = z.BRAND<string, "ObjectIdString">;
// const objectIdRegex = /^[0-9a-fA-F]{24}$/; // Example regex for ObjectId
// export const ZodObjectId = z.string().regex(objectIdRegex).brand<"ObjectIdString">();
// You would then manually change relevant `z.string()` to `ZodObjectId` for ObjectId fields.

"""


def _is_optional(field_info: FieldInfo) -> bool:
    """
    Checks if a Pydantic field is optional (i.e., not required).
    In Pydantic V2, this is simplified by field_info.is_required().
    """
    return not field_info.is_required()


def _python_type_to_zod_string(py_type: any, module_members: dict) -> str:
    """
    Converts a Python type hint to its Zod schema string.
    `module_members` is a dictionary of names to objects in the processed module,
    used to identify if a type is a known Pydantic model or Enum from that module.
    """
    origin = typing.get_origin(py_type)
    args = typing.get_args(py_type)

    if origin is typing.Annotated:
        return _python_type_to_zod_string(args[0], module_members)

    if py_type is int:
        return "z.number().int()"
    if py_type is float:
        return "z.number()"
    if py_type is str:
        return "z.string()"
    if py_type is UUID:
        return "z.string().uuid()"
    if py_type is bool:
        return "z.boolean()"
    if py_type is type(None):  # NoneType
        return "z.null()"
    if py_type is datetime or py_type is date or py_type is time:
        return "z.date()"  # Consider z.coerce.date() if inputs might be strings
    if py_type is typing.Any:
        return "z.any()"

    if "PydanticObjectId" in globals() and py_type is PydanticObjectId:
        return "z.string()"

    if origin:  # Generic types
        if origin is list or origin is set:
            if args:
                element_type_schema = _python_type_to_zod_string(
                    args[0], module_members
                )
                return f"z.array({element_type_schema})"
            return "z.array(z.any())"

        if origin is dict:
            if args and len(args) == 2:
                key_type, value_type = args[0], args[1]
                key_schema_str = _python_type_to_zod_string(key_type, module_members)
                value_schema_str = _python_type_to_zod_string(
                    value_type, module_members
                )

                is_valid_key_type = (
                    key_schema_str.startswith("z.string")
                    or key_schema_str.startswith("z.number")
                    or "z.enum(" in key_schema_str
                    or "z.nativeEnum(" in key_schema_str
                    or "z.literal(" in key_schema_str
                    or key_schema_str.startswith("z.union([")
                )

                if not is_valid_key_type:
                    resolved_key_type_name = getattr(
                        key_type, "__name__", str(key_type)
                    )
                    print(
                        f"Warning: Dictionary key type '{resolved_key_type_name}' (Zod schema: {key_schema_str}) "
                        f"may not directly map to a supported Zod Record key type (string, number, enum). "
                        f"Defaulting to 'z.string()' for the key schema. Manual review may be needed."
                    )
                    key_schema_str = "z.string()"

                return f"z.record({key_schema_str}, {value_schema_str})"
            return "z.record(z.string(), z.any())"

        if origin is tuple:
            if args:
                if (
                    len(args) == 2 and args[1] is Ellipsis
                ):  # Tuple[X, ...] -> z.array(X)
                    element_type_schema = _python_type_to_zod_string(
                        args[0], module_members
                    )
                    return f"z.array({element_type_schema})"

                tuple_member_schemas = [
                    _python_type_to_zod_string(arg, module_members) for arg in args
                ]
                return f"z.tuple([{', '.join(tuple_member_schemas)}])"
            return "z.tuple([])"

        if origin is typing.Union or (
            PY_VERSION >= (3, 10) and origin is types.UnionType
        ):
            non_none_args = [arg for arg in args if arg is not type(None)]
            is_nullable_union = type(None) in args

            if not non_none_args:  # Only NoneType in Union
                return "z.null()"

            member_schemas = [
                _python_type_to_zod_string(arg, module_members) for arg in non_none_args
            ]

            unique_member_schemas = []
            for s_schema in member_schemas:
                if s_schema not in unique_member_schemas:
                    unique_member_schemas.append(s_schema)

            if (
                not unique_member_schemas
            ):  # Should not happen if non_none_args is not empty
                return "z.any()"

            if len(unique_member_schemas) == 1:
                base_schema_str = unique_member_schemas[0]
            else:
                base_schema_str = f"z.union([{', '.join(unique_member_schemas)}])"

            if (
                is_nullable_union and base_schema_str != "z.null()"
            ):  # Avoid .nullable().nullable()
                # Check if base_schema_str already ends with .nullable() or is z.null()
                if (
                    not base_schema_str.endswith(".nullable()")
                    and base_schema_str != "z.null()"
                ):
                    return f"{base_schema_str}.nullable()"
            return base_schema_str

        if origin is typing.Literal:
            literal_zod_schemas = []
            all_literals_are_strings = True
            string_literal_values = []

            for arg_literal in args:
                if isinstance(arg_literal, str):
                    literal_zod_schemas.append(f"z.literal({json.dumps(arg_literal)})")
                    string_literal_values.append(arg_literal)
                elif isinstance(arg_literal, (int, float)):
                    literal_zod_schemas.append(f"z.literal({arg_literal})")
                    all_literals_are_strings = False
                elif isinstance(arg_literal, bool):
                    literal_zod_schemas.append(f"z.literal({str(arg_literal).lower()})")
                    all_literals_are_strings = False
                else:
                    print(
                        f"Warning: Unsupported Literal value type {type(arg_literal)} for value '{arg_literal}'. Mapping to z.any() for this item."
                    )
                    literal_zod_schemas.append("z.any()")
                    all_literals_are_strings = False

            if not literal_zod_schemas:
                return "z.any()"

            if all_literals_are_strings and len(string_literal_values) > 0:
                enum_values_str = ", ".join(
                    [json.dumps(s) for s in string_literal_values]
                )
                return f"z.enum([{enum_values_str}])"

            if len(literal_zod_schemas) == 1:
                return literal_zod_schemas[0]
            return f"z.union([{', '.join(literal_zod_schemas)}])"

    if isinstance(py_type, typing.ForwardRef):
        ref_name = py_type.__forward_arg__
        # Check if it's a known model or enum from the module to apply schema naming convention
        if ref_name in module_members:
            member = module_members[ref_name]
            if inspect.isclass(member):
                if issubclass(member, BaseModel):
                    return f"z.lazy(() => {ref_name}Schema)"
                if issubclass(member, Enum):
                    # Enums are usually directly usable or mapped to nativeEnum
                    # Forward ref to an enum schema might be unusual but possible
                    return f"z.lazy(() => {ref_name}Schema)"
        # Fallback for unknown forward refs, or if module_members isn't exhaustive
        # This might lead to TS errors if ref_name isn't a defined Zod schema.
        # Consider a warning or specific handling.
        # For now, assuming ref_name corresponds to a schema that will be available.
        return f"z.lazy(() => {ref_name})"  # Generic lazy, assumes `ref_name` is a Zod schema var

    if inspect.isclass(py_type):
        if (
            py_type.__name__ in module_members
        ):  # Check if it's a class defined in the processed module
            # Ensure it's the *exact* class from the module, not just a class with the same name from elsewhere
            if py_type is module_members[py_type.__name__]:
                if issubclass(py_type, BaseModel):
                    return f"{py_type.__name__}Schema"
                if issubclass(py_type, Enum):
                    return f"{py_type.__name__}Schema"  # Refers to the Zod schema for the enum

    type_repr = getattr(py_type, "__name__", str(py_type))
    print(
        f"Warning: Unknown Python type '{type_repr}' (Origin: {origin}, Args: {args}). Mapping to 'z.any()'."
    )
    return "z.any()"


def _get_base_zod_type_category(py_type_annotation: any) -> str:
    """
    Determines a base category ('string', 'number', 'array', 'object', 'boolean', 'date', 'tuple')
    for a Python type to help apply appropriate Zod constraints.
    Resolves Annotated types to their base.
    """
    origin = typing.get_origin(py_type_annotation)
    args = typing.get_args(py_type_annotation)

    current_type = py_type_annotation
    if origin is typing.Annotated:
        base_type = args[0]
        origin = typing.get_origin(base_type)  # Update origin for subsequent checks
        current_type = base_type

    if current_type is str or current_type is UUID:
        return "string"
    if current_type is int or current_type is float:
        return "number"
    if current_type is bool:
        return "boolean"
    if current_type is datetime or current_type is date or current_type is time:
        return "date"
    if "PydanticObjectId" in globals() and current_type is PydanticObjectId:
        return "string"

    # Use updated origin and current_type for generic checks
    if origin is list or origin is set:
        return "array"
    if origin is tuple:  # This needs to use the (potentially updated) origin
        # For Tuple[X, ...], treat as array for constraints like min/max items
        tuple_args = typing.get_args(
            current_type
        )  # Get args from current_type, not original py_type_annotation
        if tuple_args and len(tuple_args) == 2 and tuple_args[1] is Ellipsis:
            return "array"
        return "tuple"  # For fixed-length tuples, constraints are per-element, not on tuple itself easily

    if inspect.isclass(current_type) and issubclass(current_type, BaseModel):
        return "object"

    return "unknown"


def _get_zod_constraints(field_info: FieldInfo, base_zod_type_category: str) -> str:
    """Generates Zod constraint method calls based on Pydantic FieldInfo, using getattr for safety."""
    constraint_parts = []

    # String constraints
    if base_zod_type_category == "string":
        min_l = getattr(field_info, "min_length", None)
        if min_l is not None:
            constraint_parts.append(f".min({min_l})")

        max_l = getattr(field_info, "max_length", None)
        if max_l is not None:
            constraint_parts.append(f".max({max_l})")

        pattern = getattr(field_info, "pattern", None)
        if pattern is not None:
            # Ensure pattern is a raw string in JS/TS if it contains backslashes
            constraint_parts.append(f".regex(new RegExp({json.dumps(pattern)}))")

        if hasattr(
            field_info, "validation_alias"
        ):  # Pydantic v2 specific for email, url etc if not directly typed
            # This needs more specific mapping if Pydantic relies on Annotated types for this in v2
            # For now, assume basic types map directly (e.g. EmailStr -> z.string().email())
            # This function focuses on constraints like min/max length, not format validation like .email()
            pass

    # Number constraints
    elif base_zod_type_category == "number":
        val_gt = getattr(field_info, "gt", None)
        if val_gt is not None:
            constraint_parts.append(f".gt({val_gt})")

        val_lt = getattr(field_info, "lt", None)
        if val_lt is not None:
            constraint_parts.append(f".lt({val_lt})")

        val_ge = getattr(field_info, "ge", None)  # Pydantic v1: ge, Pydantic v2: ge
        if val_ge is not None:
            constraint_parts.append(f".gte({val_ge})")

        val_le = getattr(field_info, "le", None)  # Pydantic v1: le, Pydantic v2: le
        if val_le is not None:
            constraint_parts.append(f".lte({val_le})")

        multiple_of = getattr(field_info, "multiple_of", None)
        if multiple_of is not None:
            constraint_parts.append(f".multipleOf({multiple_of})")

    # Array/List/Set constraints (length/item count)
    elif base_zod_type_category == "array":
        # Pydantic V2 Field's min_length/max_length apply to collections for item count
        # Zod array's .min()/.max() are for item count.
        min_items = getattr(
            field_info, "min_length", None
        )  # Pydantic v2 uses min_length for collections
        if min_items is None:  # Fallback for Pydantic v1-style `min_items` if present
            min_items = getattr(field_info, "min_items", None)
        if min_items is not None:
            constraint_parts.append(f".min({min_items})")

        max_items = getattr(
            field_info, "max_length", None
        )  # Pydantic v2 uses max_length for collections
        if max_items is None:  # Fallback for Pydantic v1-style `max_items` if present
            max_items = getattr(field_info, "max_items", None)
        if max_items is not None:
            constraint_parts.append(f".max({max_items})")

    # Tuple constraints are typically on elements, not the tuple itself in Zod easily.
    # Object constraints (e.g. min_props, max_props) are not directly mapped here.

    return "".join(constraint_parts)


def _convert_pydantic_model_to_zod_schema(
    model_cls: type[BaseModel], module_members: dict
) -> str:
    """Converts a Pydantic model to a Zod schema string and its inferred TypeScript type."""
    zod_fields_str_list = []
    model_name = model_cls.__name__

    if not hasattr(model_cls, "model_fields"):  # Pydantic V2 check
        print(
            f"Warning: Model {model_name} does not have 'model_fields'. Skipping. "
            f"(This suggests it might be a Pydantic V1 model or not a Pydantic model.)"
        )
        return ""

    for field_name_py, field_info in model_cls.model_fields.items():
        # In Pydantic V2, field_info.alias is used for serialization/validation alias.
        # The key in the Zod object should match the expected JavaScript/TypeScript property name.
        zod_field_name_ts = field_info.alias or field_name_py

        base_zod_schema_str = _python_type_to_zod_string(
            field_info.annotation, module_members
        )
        base_type_category = _get_base_zod_type_category(field_info.annotation)
        constraints_str = _get_zod_constraints(field_info, base_type_category)
        schema_with_constraints = base_zod_schema_str + constraints_str

        if _is_optional(field_info):
            # If schema is already .nullable() from a Union[T, None], .optional() makes it T | undefined
            # If it's just T, .optional() makes it T | undefined and .nullable() makes it T | null
            # Pydantic's Optional[T] (is_required=False) means it can be absent or None.
            # Zod's .optional() = T | undefined
            # Zod's .nullable() = T | null
            # Zod's .optional().nullable() or .nullable().optional() = T | null | undefined
            # If a field is Optional[T] in Pydantic, it means it can be T, None, or not present.
            # This maps well to .optional().nullable() in Zod if the base type isn't already nullable.
            if (
                ".nullable()" in schema_with_constraints
                or schema_with_constraints == "z.null()"
            ):
                final_zod_schema_str = f"{schema_with_constraints}.optional()"
            else:
                final_zod_schema_str = (
                    f"{schema_with_constraints}.optional().nullable()"
                )

        else:  # Required field
            final_zod_schema_str = schema_with_constraints
            # If the type itself is inherently nullable (e.g. Union[str, None]) but not optional,
            # _python_type_to_zod_string should have added .nullable().

        # Ensure Zod field key is a valid JS identifier or quoted
        if not zod_field_name_ts.isidentifier() or zod_field_name_ts in {
            "default",
            "enum",
        }:  # Common JS keywords
            zod_field_key_str = json.dumps(zod_field_name_ts)
        else:
            zod_field_key_str = zod_field_name_ts

        zod_fields_str_list.append(f"  {zod_field_key_str}: {final_zod_schema_str},")

    zod_object_fields_str = "\n".join(zod_fields_str_list)

    # Basic self-referential check (very simplistic: if model name appears in its own field types string)
    # This is not a robust way to detect all recursion. Zod handles simple cases.
    # True recursion needs z.lazy for the whole object, which is complex to detect perfectly here.
    # The field-level z.lazy for ForwardRef should cover many cases.
    schema_definition_str = (
        f"export const {model_name}Schema = z.object({{\n{zod_object_fields_str}\n}});"
    )
    inferred_type_definition_str = (
        f"export type {model_name} = z.infer<typeof {model_name}Schema>;"
    )

    return f"{schema_definition_str}\n\n{inferred_type_definition_str}"


def _convert_enum_to_ts_and_zod(enum_cls: type[Enum]) -> str:
    """
    Converts a Python Enum to a TypeScript enum, a Zod schema using z.nativeEnum,
    and exports the inferred Zod type.
    """
    enum_name = enum_cls.__name__
    ts_enum_members_list = []

    for member in enum_cls:
        if isinstance(member.value, str):
            ts_enum_members_list.append(
                f"  {member.name} = {json.dumps(member.value)},"
            )
        elif isinstance(member.value, (int, float)):
            ts_enum_members_list.append(f"  {member.name} = {member.value},")
        else:
            # For complex enum values, use their string representation in TS enum
            # Zod's z.nativeEnum might have issues with non-primitive enum values depending on TS compilation
            print(
                f"Warning: Enum '{enum_name}' member '{member.name}' has a complex value type: {type(member.value)}. "
                f"Using JSON string representation for TS enum: {json.dumps(str(member.value))}. "
                f"z.nativeEnum behavior with non-string/number values should be verified."
            )
            ts_enum_members_list.append(
                f"  {member.name} = {json.dumps(str(member.value))},"
            )

    # Join members; if list is empty, members_str will be empty.
    # If members_list has items, join them with newline. The last item will have a comma.
    # Trailing commas are fine in TS enums.
    members_str = "\n".join(ts_enum_members_list)

    # Corrected: Only one closing brace for the enum block.
    ts_enum_definition_str = f"export enum {enum_name} {{\n{members_str}\n}}"
    zod_schema_definition_str = (
        f"export const {enum_name}Schema = z.nativeEnum({enum_name});"
    )
    inferred_type_definition_str = f"export type {enum_name}Type = z.infer<typeof {enum_name}Schema>;"  # Changed name to avoid conflict with enum itself

    return f"{ts_enum_definition_str}\n\n{zod_schema_definition_str}\n\n{inferred_type_definition_str}"


# --- Topological Sort Implementation ---


def _find_model_dependencies_in_type(
    py_type: any, all_module_models_map: dict[str, type[BaseModel]]
) -> set[type[BaseModel]]:
    """
    Recursively finds Pydantic model dependencies within a Python type hint.
    `all_module_models_map` contains models defined in the currently processed module.
    """
    dependencies = set()
    origin = typing.get_origin(py_type)
    args = typing.get_args(py_type)

    if origin is typing.Annotated:
        dependencies.update(
            _find_model_dependencies_in_type(args[0], all_module_models_map)
        )
        return dependencies

    if inspect.isclass(py_type) and issubclass(py_type, BaseModel):
        # Check if this class is one of the models from the target module
        if (
            py_type.__name__ in all_module_models_map
            and all_module_models_map[py_type.__name__] is py_type
        ):
            dependencies.add(py_type)
        return dependencies

    if origin:  # Generic types
        if origin is list or origin is set:
            if args:  # e.g. list[ModelA]
                dependencies.update(
                    _find_model_dependencies_in_type(args[0], all_module_models_map)
                )
        elif origin is dict:  # e.g. dict[str, ModelA] or dict[ModelA, ModelB]
            if args and len(args) == 2:
                dependencies.update(
                    _find_model_dependencies_in_type(args[0], all_module_models_map)
                )
                dependencies.update(
                    _find_model_dependencies_in_type(args[1], all_module_models_map)
                )
        elif origin is tuple:
            if args:
                if len(args) == 2 and args[1] is Ellipsis:  # Tuple[ModelA, ...]
                    dependencies.update(
                        _find_model_dependencies_in_type(args[0], all_module_models_map)
                    )
                else:  # Tuple[ModelA, ModelB]
                    for arg in args:
                        dependencies.update(
                            _find_model_dependencies_in_type(arg, all_module_models_map)
                        )
        elif origin is typing.Union or (
            PY_VERSION >= (3, 10) and origin is types.UnionType
        ):  # Union[ModelA, ModelB, str]
            for arg in args:
                if arg is not type(None):  # Skip NoneType
                    dependencies.update(
                        _find_model_dependencies_in_type(arg, all_module_models_map)
                    )

    elif isinstance(py_type, typing.ForwardRef):  # 'ModelA'
        ref_name = py_type.__forward_arg__
        if ref_name in all_module_models_map:
            dependencies.add(all_module_models_map[ref_name])

    return dependencies


def _topological_sort_util(
    item: type[BaseModel],
    dependency_graph: dict[type[BaseModel], set[type[BaseModel]]],
    visited: set[type[BaseModel]],
    recursion_stack: list[type[BaseModel]],  # Use list for path tracking
    sorted_list: list[type[BaseModel]],
    item_name_func: Callable[[type[BaseModel]], str],
):
    visited.add(item)
    recursion_stack.append(item)

    # Sort dependencies by name for deterministic output
    # These are items that `item` depends on, so they must be processed first.
    dependencies_of_item = sorted(
        list(dependency_graph.get(item, set())), key=item_name_func
    )

    for dependency in dependencies_of_item:
        if dependency not in visited:
            _topological_sort_util(
                dependency,
                dependency_graph,
                visited,
                recursion_stack,
                sorted_list,
                item_name_func,
            )
        elif dependency in recursion_stack:  # Cycle detected
            try:
                cycle_start_index = recursion_stack.index(dependency)
                # The cycle includes nodes from where `dependency` was first seen in stack up to current `item`, then back to `dependency`
                cycle_nodes = recursion_stack[cycle_start_index:] + [dependency]
                path_str = " -> ".join(item_name_func(n) for n in cycle_nodes)
                raise ValueError(
                    f"Circular dependency detected in Pydantic models: {path_str}"
                )
            except (
                ValueError
            ):  # Should not happen if dependency is in recursion_stack (list)
                raise ValueError(
                    f"Circular dependency involving Pydantic models {item_name_func(item)} and {item_name_func(dependency)}"
                )

    recursion_stack.pop()
    sorted_list.append(item)  # Add item after all its dependencies are in sorted_list


def topological_sort_models(
    models: list[type[BaseModel]],
    dependency_graph: dict[type[BaseModel], set[type[BaseModel]]],
) -> list[type[BaseModel]]:
    """
    Performs a topological sort on a list of Pydantic models.
    `dependency_graph` maps a model to a set of models it directly depends on.
    Returns a list of models in an order where dependencies appear before the models that use them.
    """
    sorted_list: list[type[BaseModel]] = []
    visited: set[type[BaseModel]] = set()
    recursion_stack: list[type[BaseModel]] = []  # For cycle detection and path printing

    # Helper to get model name for consistent sorting and error messages
    model_name_func = lambda m: m.__name__

    # Sort initial models by name to ensure deterministic processing order
    # if multiple independent dependency chains exist.
    # The _topological_sort_util also sorts dependencies by name.
    sorted_input_models = sorted(models, key=model_name_func)

    for model_cls in sorted_input_models:
        if model_cls not in visited:
            _topological_sort_util(
                model_cls,
                dependency_graph,
                visited,
                recursion_stack,
                sorted_list,
                model_name_func,
            )

    return sorted_list


# --- Main Generation Logic ---


def generate_zod_schemas(module_path: str, output_ts_file: str) -> None:
    """
    Generates Zod schemas and corresponding TypeScript types from Pydantic models and Enums
    found in a specified Python module.
    Models are topologically sorted to handle interdependencies.
    """
    try:
        module = importlib.import_module(module_path)
    except ImportError:
        print(f"Error: Could not import module '{module_path}'.")
        return

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

    # Sort enums alphabetically (their order usually doesn't create Zod/TS compilation issues)
    enums.sort(key=lambda x: x.__name__)

    # Build dependency graph for Pydantic models
    all_module_models_map = {model.__name__: model for model in pydantic_models}
    model_dependency_graph: dict[type[BaseModel], set[type[BaseModel]]] = {
        model: set() for model in pydantic_models
    }

    for model_cls in pydantic_models:
        if not hasattr(model_cls, "model_fields"):  # Skip if not a Pydantic V2 model
            continue
        for field_info in model_cls.model_fields.values():
            field_dependencies = _find_model_dependencies_in_type(
                field_info.annotation, all_module_models_map
            )
            for dep_model in field_dependencies:
                if (
                    dep_model is not model_cls
                ):  # A model doesn't "depend" on itself for sorting order
                    # model_cls depends on dep_model
                    model_dependency_graph[model_cls].add(dep_model)

    try:
        # Topologically sort Pydantic models
        # The initial sort of pydantic_models by name (done before graph building via all_module_models_map
        # or explicitly before calling topological_sort_models) helps ensure deterministic output
        # when multiple valid topological orders exist.
        # topological_sort_models itself also sorts inputs/dependencies by name.
        sorted_pydantic_models = topological_sort_models(
            pydantic_models, model_dependency_graph
        )
    except ValueError as e:  # Catches circular dependency errors
        print(f"Error during model sorting: {e}")
        print(
            "Cannot generate Zod schemas due to circular dependencies among Pydantic models."
        )
        return

    output_parts = []

    # First, generate Enums
    for enum_cls in enums:
        output_parts.append(_convert_enum_to_ts_and_zod(enum_cls))

    # Then, generate Pydantic models in topologically sorted order
    for model_cls in sorted_pydantic_models:
        # Pass all module_members for comprehensive type resolution within _python_type_to_zod_string
        # This includes enums, other models, and potentially other types defined in the module.
        model_zod_schema_str = _convert_pydantic_model_to_zod_schema(
            model_cls, module_members
        )
        if model_zod_schema_str:  # In case of skipping (e.g., Pydantic V1 model)
            output_parts.append(model_zod_schema_str)

    file_header_comments = (
        f"// Generated by pydantic-to-zod-converter\n"
        f"// From Pydantic models in Python module: {module.__name__} (path: {module_path})\n"
        f"// Timestamp: {datetime.now().isoformat()}\n\n"
    )

    final_ts_code = (
        file_header_comments
        + _ZOD_HEADER_IMPORTS
        + "\n\n"
        + "\n\n".join(filter(None, output_parts))  # Filter out any empty strings
    )

    output_directory = os.path.dirname(output_ts_file)
    if output_directory and not os.path.exists(output_directory):
        os.makedirs(output_directory)
        print(f"Created output directory: {output_directory}")

    try:
        with open(output_ts_file, "w", encoding="utf-8") as f:
            f.write(final_ts_code)
        print(f"Zod schemas generated successfully at '{output_ts_file}'")
    except IOError as e:
        print(f"Error: Could not write to output file '{output_ts_file}': {e}")
