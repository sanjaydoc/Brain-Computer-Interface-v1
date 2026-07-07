"""DrosophilaSource — the fruit-fly brain connectome (the rung after MICrONS).

Targets a real fly connectome (FlyWire adult ~140k, hemibrain ~25k, or the complete larval
~3k brain) downloaded + normalized by `scripts/fetch_drosophila.py` into the CSV cache this
class reads. Same `ConnectomeSource` interface as every other rung.
"""

from __future__ import annotations

from pathlib import Path

from .base import sources
from .csv_source import load_csv_connectome
from .schema import Connectome

DATA = Path(__file__).resolve().parents[3] / "data" / "connectomes" / "drosophila"


@sources.register("drosophila")
class DrosophilaSource:
    """Drosophila brain connectome. Data via FlyWire / hemibrain / larval release."""

    def __init__(self, data_dir: str | Path | None = None) -> None:
        self.dir = Path(data_dir) if data_dir else DATA

    def load(self) -> Connectome:
        return load_csv_connectome(
            self.dir, fetch_hint="python scripts/fetch_drosophila.py"
        )
