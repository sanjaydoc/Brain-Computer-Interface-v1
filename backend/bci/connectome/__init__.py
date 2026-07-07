"""Connectome (Brain Template structure) — normalized schema + pluggable sources."""

from .base import ConnectomeSource, sources
from .schema import Connectome
from . import synthetic  # noqa: F401  — registers "synthetic" into `sources`
from . import celegans  # noqa: F401  — registers "celegans" into `sources`
from . import microns  # noqa: F401  — registers "microns" (Rung 2) into `sources`
from . import drosophila  # noqa: F401  — registers "drosophila" into `sources`

__all__ = ["Connectome", "ConnectomeSource", "sources"]
