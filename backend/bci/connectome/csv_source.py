"""Shared loader for connectomes cached as CSVs (neurons.csv + synapses.csv).

The vendored/fetched cache format (same as C. elegans):
  neurons.csv   : id,type,x,y,z
  synapses.csv  : pre,post,kind,weight

Runtime loaders (MICrONS, Drosophila, ...) read this — no network or heavy deps at
runtime; a `scripts/fetch_*.py` populates the cache on a machine with internet + credentials.
"""

from __future__ import annotations

import csv
from pathlib import Path

import numpy as np
import scipy.sparse as sp

from .schema import Connectome


def load_csv_connectome(data_dir: str | Path, fetch_hint: str) -> Connectome:
    d = Path(data_dir)
    neurons_csv, synapses_csv = d / "neurons.csv", d / "synapses.csv"
    if not neurons_csv.exists():
        raise FileNotFoundError(
            f"{neurons_csv} not found — this connectome isn't cached yet. "
            f"Run `{fetch_hint}` on a machine with internet (and credentials) to download it."
        )

    ids, types, xyz = [], [], []
    with open(neurons_csv, newline="") as f:
        for row in csv.DictReader(f):
            ids.append(row["id"]); types.append(row.get("type", "neuron"))
            xyz.append((float(row["x"]), float(row["y"]), float(row["z"])))

    index = {name: i for i, name in enumerate(ids)}
    n = len(ids)
    pre, post, w = [], [], []
    with open(synapses_csv, newline="") as f:
        for row in csv.DictReader(f):
            i, j = index.get(row["pre"]), index.get(row["post"])
            if i is None or j is None:
                continue
            pre.append(i); post.append(j); w.append(float(row.get("weight", 1.0)))

    weights = sp.coo_matrix(
        (np.array(w, dtype=np.float32), (np.array(pre), np.array(post))),
        shape=(n, n), dtype=np.float32,
    ).tocsr()
    weights.sum_duplicates()
    return Connectome(
        ids=np.array(ids, dtype=object), types=np.array(types, dtype=object),
        pos=np.array(xyz, dtype=np.float32), weights=weights,
    )
