"""SyntheticSource — a generated connectome for testing and, crucially, for *proving
scalability* (PLAN §2.3 enforcement) at 1M / 10M neurons before real data exists.

Built entirely with vectorized numpy + sparse assembly: O(N + E), no Python-per-neuron
loops, no dense N*N allocation. This is the reference for how every source must scale.
"""

from __future__ import annotations

import numpy as np
import scipy.sparse as sp

from .base import sources
from .schema import Connectome


@sources.register("synthetic")
class SyntheticSource:
    """Random sparse network with a fixed out-degree.

    Parameters
    ----------
    n : number of neurons.
    avg_degree : mean synapses per neuron (out-degree). Total synapses ~= n * avg_degree.
    seed : RNG seed for reproducibility (no Math.random-style nondeterminism).
    """

    def __init__(self, n: int = 1000, avg_degree: int = 10, seed: int = 0) -> None:
        if n <= 0:
            raise ValueError("n must be positive")
        self.n = int(n)
        self.avg_degree = int(min(avg_degree, n - 1)) if n > 1 else 0
        self.seed = int(seed)

    def load(self) -> Connectome:
        rng = np.random.default_rng(self.seed)
        n, k = self.n, self.avg_degree

        ids = np.array([f"n{i}" for i in range(n)], dtype=object)
        types = np.full(n, "synthetic", dtype=object)
        # Neurons scattered in a unit cube — gives the viz + acoustic addressing real 3D space.
        pos = rng.random((n, 3), dtype=np.float32)

        if k == 0:
            weights = sp.csr_matrix((n, n), dtype=np.float32)
            return Connectome(ids=ids, types=types, pos=pos, weights=weights)

        # Vectorized edge generation: each of n neurons gets k out-targets (COO -> CSR).
        pre = np.repeat(np.arange(n, dtype=np.int64), k)
        post = rng.integers(0, n, size=n * k, dtype=np.int64)
        w = rng.random(n * k, dtype=np.float32)
        mask = pre != post  # drop self-loops
        weights = sp.coo_matrix(
            (w[mask], (pre[mask], post[mask])), shape=(n, n), dtype=np.float32
        ).tocsr()
        weights.sum_duplicates()

        return Connectome(ids=ids, types=types, pos=pos, weights=weights)
