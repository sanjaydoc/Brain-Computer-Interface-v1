"""Connectome data model — Structure-of-Arrays + sparse connectivity.

Scalability Contract (PLAN §2.3):
  * Rule 1 — no per-neuron objects: neuron fields are parallel numpy arrays (SoA).
  * Rule 2 — sparse, never dense: connectivity is a scipy CSR matrix (O(E), never N*N).
  * Rule 3 — linear or better: every operation here is O(N) or O(E).

This is the normalized shape ALL sources (celegans / synthetic / microns) produce, so the
engine, twin, and viz never know which source was loaded.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import scipy.sparse as sp


@dataclass
class Connectome:
    """A normalized connectome as columnar arrays + a sparse synapse matrix.

    Neuron i is identified by index i everywhere (ids/types/pos are id-indexed arrays).
    """

    ids: np.ndarray          # (N,) str/object  — stable names (e.g. "AVAL" or "n42")
    types: np.ndarray        # (N,) str/object  — cell type / class
    pos: np.ndarray          # (N, 3) float32   — 3D coordinates (for viz + acoustic addressing)
    weights: sp.csr_matrix   # (N, N) sparse    — weights[pre, post]; nnz = number of synapses
    sign: np.ndarray | None = None  # (N,) float32 in {+1,-1} — per-neuron excit/inhib, if known
                                    # (e.g. from FlyWire neurotransmitter predictions). None →
                                    # the engine falls back to a name-based heuristic.

    def __post_init__(self) -> None:
        n = self.n_neurons
        if self.types.shape[0] != n or self.pos.shape[0] != n:
            raise ValueError("ids/types/pos must have the same length (one row per neuron)")
        if self.pos.shape[1] != 3:
            raise ValueError("pos must be (N, 3)")
        if self.weights.shape != (n, n):
            raise ValueError(f"weights must be ({n}, {n}), got {self.weights.shape}")
        if self.sign is not None and self.sign.shape[0] != n:
            raise ValueError("sign must have one entry per neuron")

    @property
    def n_neurons(self) -> int:
        return int(self.ids.shape[0])

    @property
    def n_synapses(self) -> int:
        return int(self.weights.nnz)

    def summary(self) -> str:
        density = self.n_synapses / max(self.n_neurons ** 2, 1)
        return (
            f"Connectome: {self.n_neurons:,} neurons, {self.n_synapses:,} synapses "
            f"(density {density:.2e}, ~{self.n_synapses / max(self.n_neurons,1):.1f} syn/neuron)"
        )
