#!/usr/bin/env python3
"""Fail CI when generated OpenAPI drifts from committed contracts.

This check compares high-signal API contract shape:
- normalized path set (path-param names ignored)
- HTTP methods per path
- bearer security requirement parity per operation
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from typing import Any

import yaml

HTTP_METHODS = {"get", "post", "put", "patch", "delete", "head", "options"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Check OpenAPI contract drift")
    parser.add_argument("--service", required=True, help="Service name for error messages")
    parser.add_argument("--generated", required=True, help="Path to generated OpenAPI JSON")
    parser.add_argument("--contract", required=True, help="Path to committed OpenAPI YAML")
    parser.add_argument(
        "--generated-security-name",
        default="bearerAuth",
        help="Bearer security scheme name expected in generated spec",
    )
    parser.add_argument(
        "--contract-security-name",
        default="BearerAuth",
        help="Bearer security scheme name expected in committed contract",
    )
    return parser.parse_args()


def normalize_path(path: str) -> str:
    return re.sub(r"\{[^}]+\}", "{param}", path)


def load_generated(path: str) -> dict[str, Any]:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def load_contract(path: str) -> dict[str, Any]:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def extract_operations(spec: dict[str, Any]) -> dict[str, dict[str, dict[str, Any]]]:
    ops: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
    for raw_path, item in (spec.get("paths") or {}).items():
        if not isinstance(item, dict):
            continue
        norm = normalize_path(raw_path)
        for method, operation in item.items():
            method_lc = method.lower()
            if method_lc in HTTP_METHODS and isinstance(operation, dict):
                ops[norm][method_lc] = operation
    return ops


def has_security_scheme(spec: dict[str, Any], scheme_name: str) -> bool:
    schemes = ((spec.get("components") or {}).get("securitySchemes") or {}).keys()
    return any(name.lower() == scheme_name.lower() for name in schemes)


def requires_bearer(
    operation: dict[str, Any], top_security: list[Any], bearer_scheme_name: str
) -> bool:
    security = operation.get("security", top_security)
    if not security:
        return False
    for sec in security:
        if not isinstance(sec, dict):
            continue
        for name in sec.keys():
            if name.lower() == bearer_scheme_name.lower():
                return True
    return False


def main() -> int:
    args = parse_args()
    generated = load_generated(args.generated)
    contract = load_contract(args.contract)

    generated_ops = extract_operations(generated)
    contract_ops = extract_operations(contract)

    errors: list[str] = []

    # 1) Path parity (normalized)
    generated_paths = set(generated_ops.keys())
    contract_paths = set(contract_ops.keys())
    missing_paths = sorted(contract_paths - generated_paths)
    extra_paths = sorted(generated_paths - contract_paths)
    if missing_paths:
        errors.append(
            "Missing paths in generated spec: " + ", ".join(missing_paths[:20])
        )
    if extra_paths:
        errors.append("Extra paths in generated spec: " + ", ".join(extra_paths[:20]))

    # 2) Method parity per path
    for path in sorted(contract_paths & generated_paths):
        expected_methods = set(contract_ops[path].keys())
        actual_methods = set(generated_ops[path].keys())
        missing_methods = sorted(expected_methods - actual_methods)
        extra_methods = sorted(actual_methods - expected_methods)
        if missing_methods:
            errors.append(f"{path}: missing methods {missing_methods}")
        if extra_methods:
            errors.append(f"{path}: extra methods {extra_methods}")

    # 3) Bearer scheme presence
    if not has_security_scheme(generated, args.generated_security_name):
        errors.append(
            f"Generated spec is missing security scheme '{args.generated_security_name}'"
        )
    if not has_security_scheme(contract, args.contract_security_name):
        errors.append(
            f"Contract spec is missing security scheme '{args.contract_security_name}'"
        )

    # 4) Operation security parity (secured vs public)
    contract_top_security = contract.get("security", []) or []
    generated_top_security = generated.get("security", []) or []
    for path in sorted(contract_paths & generated_paths):
        for method in sorted(set(contract_ops[path].keys()) & set(generated_ops[path].keys())):
            contract_secured = requires_bearer(
                contract_ops[path][method], contract_top_security, args.contract_security_name
            )
            generated_secured = requires_bearer(
                generated_ops[path][method], generated_top_security, args.generated_security_name
            )
            if contract_secured != generated_secured:
                errors.append(
                    f"{method.upper()} {path}: security mismatch "
                    f"(contract secured={contract_secured}, generated secured={generated_secured})"
                )

    if errors:
        print(f"[{args.service}] OpenAPI drift detected:")
        for err in errors:
            print(f"  - {err}")
        return 1

    print(f"[{args.service}] OpenAPI drift check passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
