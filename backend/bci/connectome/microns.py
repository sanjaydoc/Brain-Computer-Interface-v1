"""MICrONSSource — Rung 2 of the ladder: the MICrONS mouse visual-cortex column.

The full volume is ~200k neurons / ~500M synapses (`minnie65_public`, via CAVE). That is
downloaded, proofread-filtered, and (optionally) downsampled by `scripts/fetch_microns.py`
into the CSV cache this class reads. Behind the same `ConnectomeSource` interface as the
worm — the engine, twin, and LOD viewer don't know or care which loaded.
"""

from __future__ import annotations

from pathlib import Path

from .base import sources
from .csv_source import load_csv_connectome
from .schema import Connectome

DATA = Path(__file__).resolve().parents[3] / "data" / "connectomes" / "microns"


@sources.register("microns")
class MICrONSSource:
    """Mouse cortical column (real EM, downsampled). Data via CAVE / `caveclient`."""

    def __init__(self, data_dir: str | Path | None = None) -> None:
        self.dir = Path(data_dir) if data_dir else DATA

    def load(self) -> Connectome:
        return load_csv_connectome(
            self.dir, fetch_hint="python scripts/fetch_microns.py"
        )
