"""ConnectomeSource seam — the pluggable loader interface + its registry.

Config selects which source loads (celegans / synthetic / microns). Everything
downstream depends only on the normalized `Connectome`, never on the source.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from ..registry import Registry
from .schema import Connectome


@runtime_checkable
class ConnectomeSource(Protocol):
    """Anything that can produce a normalized Connectome."""

    def load(self) -> Connectome: ...


# The registry every source registers into (see synthetic.py, celegans.py, microns.py).
sources: Registry[ConnectomeSource] = Registry("connectome-source")
