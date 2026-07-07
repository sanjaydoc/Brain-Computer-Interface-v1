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

# Neurotransmitter → synaptic sign. Insect wiring (FlyWire predictions): acetylcholine excites;
# GABA and glutamate (GluClα) inhibit; the monoamines are modulatory — treated as mild excitatory.
NT_SIGN = {
    "ACH": 1.0, "ACETYLCHOLINE": 1.0,
    "GABA": -1.0,
    "GLUT": -1.0, "GLUTAMATE": -1.0,
    "DA": 1.0, "DOPAMINE": 1.0,
    "SER": 1.0, "SEROTONIN": 1.0,
    "OCT": 1.0, "OCTOPAMINE": 1.0,
}


def nt_to_sign(nt: str) -> float:
    """Map a neurotransmitter label to a +1 (excitatory) / -1 (inhibitory) synaptic sign."""
    return NT_SIGN.get(str(nt).strip().upper(), 1.0)


def load_csv_connectome(data_dir: str | Path, fetch_hint: str) -> Connectome:
    d = Path(data_dir)
    neurons_csv, synapses_csv = d / "neurons.csv", d / "synapses.csv"
    if not neurons_csv.exists():
        raise FileNotFoundError(
            f"{neurons_csv} not found — this connectome isn't cached yet. "
            f"Run `{fetch_hint}` on a machine with internet (and credentials) to download it."
        )

    ids, types, xyz, nts = [], [], [], []
    has_nt = False
    with open(neurons_csv, newline="") as f:
        for row in csv.DictReader(f):
            ids.append(row["id"]); types.append(row.get("type", "neuron"))
            xyz.append((float(row["x"]), float(row["y"]), float(row["z"])))
            nt = row.get("nt")
            if nt:
                has_nt = True
            nts.append(nt)

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
    # If the cache carries neurotransmitters, derive a real excit/inhib sign per neuron.
    sign = (np.array([nt_to_sign(x) for x in nts], dtype=np.float32) if has_nt else None)
    return Connectome(
        ids=np.array(ids, dtype=object), types=np.array(types, dtype=object),
        pos=np.array(xyz, dtype=np.float32), weights=weights, sign=sign,
    )
