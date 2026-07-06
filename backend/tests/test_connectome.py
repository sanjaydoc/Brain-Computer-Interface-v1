"""P0 tests — correctness of the spine + the Scalability Contract enforcement (PLAN §2.3).

The scale test is the important one: a module isn't "scalable" until it's proven at
1M neurons. This guards the whole project's core promise.
"""

from __future__ import annotations

import time

import numpy as np
import scipy.sparse as sp

from bci.connectome import Connectome, sources
from bci.registry import Registry


def test_synthetic_shapes_and_types():
    c = sources.create("synthetic", n=500, avg_degree=8, seed=1).load()
    assert c.n_neurons == 500
    assert c.ids.shape == (500,)
    assert c.pos.shape == (500, 3)
    assert isinstance(c.weights, sp.csr_matrix)
    assert c.weights.shape == (500, 500)
    # no self-loops
    assert c.weights.diagonal().sum() == 0
    # roughly n * avg_degree synapses (minus dropped self-loops)
    assert 500 * 8 * 0.9 <= c.n_synapses <= 500 * 8


def test_reproducible_seed():
    a = sources.create("synthetic", n=200, seed=42).load()
    b = sources.create("synthetic", n=200, seed=42).load()
    assert (a.weights != b.weights).nnz == 0
    assert np.array_equal(a.pos, b.pos)


def test_registry_unknown_key_is_helpful():
    r: Registry = Registry("thing")
    try:
        r.get("nope")
    except KeyError as e:
        assert "unknown implementation 'nope'" in str(e)
    else:  # pragma: no cover
        raise AssertionError("expected KeyError")


def test_scalability_one_million_neurons():
    """Scalability Contract: SoA + sparse assembly must handle 1M neurons quickly.

    ~1M neurons x 10 = ~10M synapses. If this used per-neuron objects or a dense matrix
    it would be impossible; with SoA + vectorized sparse it is a fraction of a second.
    """
    n = 1_000_000
    t0 = time.perf_counter()
    c = sources.create("synthetic", n=n, avg_degree=10, seed=0).load()
    dt = time.perf_counter() - t0
    assert c.n_neurons == n
    assert c.n_synapses > 9_000_000
    # Generous ceiling; typically well under 5s. Proves no accidental O(N^2) / Python loop.
    assert dt < 20.0, f"1M-neuron load took {dt:.1f}s — scalability regression"
