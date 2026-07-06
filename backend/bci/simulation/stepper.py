"""Stepper — the synaptic-propagation seam (PLAN §2.2).

One step = a sparse matrix-vector product (Scalability Contract §2.3: O(E), the operation
GPUs/clusters are built for). v1 ships a numpy CPU stepper; `gpu`/distributed drop in
behind the same interface.

Signals flow pre → post: current into `post` = Σ_pre W[pre,post]·spike[pre]. We store
Wt = Wᵀ (post × pre) as CSR so that step = Wt · spikes.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

import numpy as np
import scipy.sparse as sp

from ..registry import Registry


@runtime_checkable
class Stepper(Protocol):
    def propagate(self, spikes: np.ndarray) -> np.ndarray: ...


steppers: Registry[Stepper] = Registry("stepper")


def build_transpose(
    weights: sp.csr_matrix,
    sign: np.ndarray,
    row_normalize: bool = True,
) -> sp.csr_matrix:
    """Build Wt (post × pre) with presynaptic signs applied and optional per-neuron
    (row) synaptic normalization — the homeostatic scaling that stops hub neurons from
    saturating and lets pathway structure show through."""
    wt = weights.T.tocsr().astype(np.float32)          # (post, pre)
    wt = wt.multiply(sign.reshape(1, -1)).tocsr()      # sign per presynaptic (column)
    if row_normalize:
        mag = np.abs(wt).sum(axis=1).A.ravel()         # total |incoming| per post
        mag[mag == 0] = 1.0
        scale = sp.diags((1.0 / mag).astype(np.float32))
        wt = (scale @ wt).tocsr()
    return wt


@steppers.register("cpu_numpy")
class NumpyStepper:
    def __init__(self, wt: sp.csr_matrix, gsyn: float = 1.0) -> None:
        self.wt = wt
        self.gsyn = float(gsyn)

    def propagate(self, spikes: np.ndarray) -> np.ndarray:
        return self.wt.dot(spikes.astype(np.float32)) * self.gsyn
