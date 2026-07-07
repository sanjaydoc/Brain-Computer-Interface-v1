"""Tests for Rung 3 — the mesoscale statistical connectome source.

Covers registration, the scalability contract (sparse, O(N+E), deterministic), the
region-modular structure that distinguishes it from uniform-random `synthetic`, and that
the engine can run it.
"""

from __future__ import annotations

import numpy as np
import scipy.sparse as sp

from bci.connectome import sources


def test_mesoscale_registered():
    assert "mesoscale" in sources.keys()


def test_shape_and_sparsity():
    c = sources.create("mesoscale", n=2000, avg_degree=10, n_regions=20, seed=0).load()
    assert c.n_neurons == 2000
    assert isinstance(c.weights, sp.csr_matrix)        # sparse, never dense
    assert c.pos.shape == (2000, 3)
    assert 5 <= c.n_synapses / c.n_neurons <= 15       # ~avg_degree, no self-loops blow-up


def test_deterministic():
    a = sources.create("mesoscale", n=1500, n_regions=12, seed=7).load()
    b = sources.create("mesoscale", n=1500, n_regions=12, seed=7).load()
    assert (a.weights != b.weights).nnz == 0           # same seed → identical wiring
    assert np.array_equal(a.pos, b.pos)


def test_wiring_is_region_modular():
    """The defining property: synapses land within-region far more than chance."""
    R = 25
    c = sources.create("mesoscale", n=5000, avg_degree=12, n_regions=R,
                       local_frac=0.55, seed=1).load()
    w = c.weights.tocoo()
    within = (c.types[w.row] == c.types[w.col]).mean()
    assert within > 5 * (1 / R)                        # vastly above uniform-random baseline


def test_engine_runs_mesoscale():
    from bci.runtime import Runtime

    rt = Runtime.build(connectome_impl="mesoscale",
                       connectome_params={"n": 1200, "n_regions": 15, "seed": 2})
    fired = 0
    for _ in range(80):
        rt.step()
        fired = max(fired, int(np.asarray(rt.engine.spikes).sum()))
    assert rt.engine.n == 1200
    assert fired > 0                                   # activity emerges from the wiring
