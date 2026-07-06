"""Tests for the real C. elegans connectome source (Rung 1)."""

from __future__ import annotations

import numpy as np

from bci.connectome import sources


def test_worm_loads_302_neurons():
    c = sources.create("celegans").load()
    assert c.n_neurons == 302
    assert 4000 < c.n_synapses < 7000  # ~5-6k synaptic connections


def test_worm_has_real_3d_positions():
    c = sources.create("celegans").load()
    assert c.pos.shape == (302, 3)
    # real anatomical coordinates span a real range (microns along the worm body)
    spread = c.pos.max(axis=0) - c.pos.min(axis=0)
    assert np.all(spread > 1.0)          # not all collapsed to one point
    assert spread[1] > spread[0]         # worm is long on the A-P (y) axis


def test_worm_named_neurons_present():
    c = sources.create("celegans").load()
    names = set(c.ids.tolist())
    # canonical command interneurons that must exist in any real C. elegans connectome
    for n in ("AVAL", "AVAR", "AVBL", "AVBR", "PVCL"):
        assert n in names


def test_worm_normalized_like_every_source():
    """The worm produces the same shape as synthetic — downstream is source-agnostic."""
    worm = sources.create("celegans").load()
    syn = sources.create("synthetic", n=302, seed=0).load()
    assert worm.weights.shape == syn.weights.shape == (302, 302)
    assert worm.pos.shape == syn.pos.shape
