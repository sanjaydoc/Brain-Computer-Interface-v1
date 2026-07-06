"""Generic registry — the spine of configurability (PLAN §2.2).

Every swappable layer (connectome source, neuron model, stepper, renderer, ...) owns a
Registry. Config names a key; the registry returns the implementation. Adding a variant
is one `register()` call — never an edit to the core.

    sources = Registry[ConnectomeSource]("connectome-source")

    @sources.register("synthetic")
    class SyntheticSource: ...

    src = sources.create("synthetic", n=1000, seed=0)
"""

from __future__ import annotations

from typing import Callable, Generic, Iterable, TypeVar

T = TypeVar("T")


class Registry(Generic[T]):
    """A named lookup of implementations for one interface/seam."""

    def __init__(self, kind: str) -> None:
        self.kind = kind
        self._impls: dict[str, type[T]] = {}

    def register(self, key: str) -> Callable[[type[T]], type[T]]:
        """Decorator: register an implementation class under ``key``."""

        def deco(cls: type[T]) -> type[T]:
            if key in self._impls:
                raise ValueError(f"{self.kind}: '{key}' already registered")
            self._impls[key] = cls
            return cls

        return deco

    def get(self, key: str) -> type[T]:
        try:
            return self._impls[key]
        except KeyError:
            raise KeyError(
                f"{self.kind}: unknown implementation '{key}'. "
                f"Available: {sorted(self._impls)}"
            ) from None

    def create(self, key: str, **kwargs) -> T:
        """Instantiate the implementation named ``key`` with ``kwargs``."""
        return self.get(key)(**kwargs)

    def keys(self) -> Iterable[str]:
        return sorted(self._impls)

    def __contains__(self, key: str) -> bool:
        return key in self._impls
