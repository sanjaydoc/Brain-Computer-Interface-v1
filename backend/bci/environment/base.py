"""Environment interface + registry."""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from ..registry import Registry


@runtime_checkable
class Environment(Protocol):
    def before_step(self, engine, writer) -> None: ...
    def after_step(self, engine, readout) -> None: ...


environments: Registry[Environment] = Registry("environment")
