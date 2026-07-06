"""Typed, validated configuration (PLAN §2.2).

A profile (e.g. profiles/synthetic_small.yaml) selects an implementation per seam plus
its params. Pydantic validates it at load, so a bad combo fails loudly and early rather
than deep inside a run. This is the object the whole system is constructed from.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, Field


class SeamConfig(BaseModel):
    """One seam: which implementation ('impl') and its constructor params."""

    impl: str
    params: dict[str, Any] = Field(default_factory=dict)


class Config(BaseModel):
    """Top-level run config. New seams are added here as the build grows."""

    name: str = "unnamed"
    connectome: SeamConfig

    @classmethod
    def load(cls, path: str | Path) -> "Config":
        data = yaml.safe_load(Path(path).read_text())
        return cls.model_validate(data)
