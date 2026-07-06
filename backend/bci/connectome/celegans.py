"""CElegansSource — the real 302-neuron C. elegans connectome (Rung 1 of the ladder).

Loads the vendored CSVs produced by scripts/fetch_celegans.py:
  * neurons.csv  — id, type, x, y, z   (Cook 2019 neurons + OpenWorm 3D positions)
  * synapses.csv — pre, post, kind, weight

Real, complete, and offline: no network or `cect` dependency at runtime. Normalizes into
the same SoA + CSR `Connectome` that every other source produces.
"""

from __future__ import annotations

import csv
from pathlib import Path

import numpy as np
import scipy.sparse as sp

from .base import sources
from .schema import Connectome

DATA = Path(__file__).resolve().parents[3] / "data" / "connectomes" / "celegans"


@sources.register("celegans")
class CElegansSource:
    """The worm. 302 neurons, ~5,900 synapses, real anatomical 3D positions."""

    def __init__(self, data_dir: str | Path | None = None) -> None:
        self.dir = Path(data_dir) if data_dir else DATA

    def load(self) -> Connectome:
        neurons_csv = self.dir / "neurons.csv"
        synapses_csv = self.dir / "synapses.csv"
        if not neurons_csv.exists():
            raise FileNotFoundError(
                f"{neurons_csv} not found — run `python scripts/fetch_celegans.py` first."
            )

        ids: list[str] = []
        types: list[str] = []
        xyz: list[tuple[float, float, float]] = []
        with open(neurons_csv, newline="") as f:
            for row in csv.DictReader(f):
                ids.append(row["id"])
                types.append(row["type"])
                xyz.append((float(row["x"]), float(row["y"]), float(row["z"])))

        index = {name: i for i, name in enumerate(ids)}
        n = len(ids)

        pre, post, w = [], [], []
        with open(synapses_csv, newline="") as f:
            for row in csv.DictReader(f):
                i, j = index.get(row["pre"]), index.get(row["post"])
                if i is None or j is None:
                    continue
                pre.append(i)
                post.append(j)
                w.append(float(row["weight"]))

        weights = sp.coo_matrix(
            (np.array(w, dtype=np.float32), (np.array(pre), np.array(post))),
            shape=(n, n),
            dtype=np.float32,
        ).tocsr()
        weights.sum_duplicates()

        return Connectome(
            ids=np.array(ids, dtype=object),
            types=np.array(types, dtype=object),
            pos=np.array(xyz, dtype=np.float32),
            weights=weights,
        )
