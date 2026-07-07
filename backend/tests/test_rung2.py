"""Tests for Rung 2 connectome sources (MICrONS, Drosophila) — registration, graceful
absence, and the shared CSV loader."""

from __future__ import annotations

import pytest

from bci.connectome import sources
from bci.connectome.csv_source import load_csv_connectome


def test_rung2_sources_registered():
    for name in ("microns", "drosophila"):
        assert name in sources.keys()


@pytest.mark.parametrize("name,hint", [("microns", "fetch_microns"), ("drosophila", "fetch_drosophila")])
def test_missing_cache_gives_helpful_error(name, hint):
    with pytest.raises(FileNotFoundError) as exc:
        sources.create(name).load()
    assert hint in str(exc.value)   # tells the user which fetch script to run


def test_csv_loader_normalizes(tmp_path):
    (tmp_path / "neurons.csv").write_text(
        "id,type,x,y,z\nA,exc,0,0,0\nB,inh,1,0,0\nC,exc,0,1,0\n")
    (tmp_path / "synapses.csv").write_text(
        "pre,post,kind,weight\nA,B,chemical,3\nB,C,chemical,2\nA,B,chemical,1\n")
    c = load_csv_connectome(tmp_path, fetch_hint="x")
    assert c.n_neurons == 3
    assert c.n_synapses == 2                       # A→B duplicate summed
    assert c.weights[0, 1] == 4                     # 3 + 1
    assert c.pos.shape == (3, 3)
