"""Minimal PyYAML-compatible shim for local plugin validation.

This covers the simple YAML frontmatter used by this plugin's SKILL.md files.
It is intentionally small so validation does not depend on a global Python
environment or network-installed packages.
"""

from __future__ import annotations


class YAMLError(Exception):
    pass


def safe_load(source: str) -> dict[str, object] | None:
    if not source.strip():
        return None

    result: dict[str, object] = {}
    for line_number, raw_line in enumerate(source.splitlines(), start=1):
        stripped = raw_line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if raw_line[:1].isspace():
            raise YAMLError(f"unsupported indentation on line {line_number}")
        if ":" not in stripped:
            raise YAMLError(f"expected key/value pair on line {line_number}")

        key, raw_value = stripped.split(":", 1)
        key = key.strip()
        if not key:
            raise YAMLError(f"empty key on line {line_number}")
        result[key] = _parse_scalar(raw_value.strip())

    return result


def _parse_scalar(value: str) -> object:
    if value == "":
        return None
    if value in ("true", "True"):
        return True
    if value in ("false", "False"):
        return False
    if value in ("null", "Null", "~"):
        return None
    if (
        len(value) >= 2
        and value[0] == value[-1]
        and value[0] in ("'", '"')
    ):
        return value[1:-1]
    return value
