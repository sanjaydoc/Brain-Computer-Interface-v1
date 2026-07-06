"""Tests for the molecular (Part 1) integration: generation, channels, connectome assay."""

from __future__ import annotations

import pytest

from bci.connectome import sources
from bci.molecular import MolecularService, SonogeneticChannel
from bci.molecular import test_on_connectome as run_assay
from bci.molecular.channel import sensitivity_proxy


def test_fallback_generates_valid_channels():
    svc = MolecularService()
    assert svc.backends()["fallback"] is True
    res = svc.generate_channels("smiles", 5, target="rev")
    assert len(res["channels"]) == 5
    for ch in res["channels"]:
        assert 0.0 <= ch["sensitivity"] <= 1.0
        assert ch["target"] == "rev"
        assert ch["sequence"]


def test_sensitivity_proxy_deterministic():
    a = sensitivity_proxy("GIGAVLKVLTTGLPALISWIKRKRQQ", "protein")
    b = sensitivity_proxy("GIGAVLKVLTTGLPALISWIKRKRQQ", "protein")
    assert a == b and 0.2 <= a <= 0.85


def test_assay_direction_follows_target():
    c = sources.create("celegans").load()
    rev = run_assay(c, SonogeneticChannel("r", "x", "smiles", 0.8, "rev"))
    fwd = run_assay(c, SonogeneticChannel("f", "x", "smiles", 0.8, "fwd"))
    assert rev["direction"] == "reverse" and rev["loco_response"] < 0
    assert fwd["direction"] == "forward" and fwd["loco_response"] > 0


def test_assay_response_scales_with_sensitivity():
    c = sources.create("celegans").load()
    lo = run_assay(c, SonogeneticChannel("lo", "x", "smiles", 0.25, "rev"))
    hi = run_assay(c, SonogeneticChannel("hi", "x", "smiles", 0.85, "rev"))
    assert abs(hi["loco_response"]) >= abs(lo["loco_response"])  # more sensitive → stronger


def test_molecular_api():
    pytest.importorskip("fastapi")
    from fastapi.testclient import TestClient
    from bci.api.app import app
    client = TestClient(app)

    assert client.get("/api/molecular/backends").json()["fallback"] is True
    gen = client.post("/api/molecular/generate", json={"modality": "smiles", "n": 3, "target": "fwd"}).json()
    assert len(gen["channels"]) == 3
    seq = gen["channels"][0]["sequence"]
    res = client.post("/api/molecular/test", json={"sequence": seq, "target": "fwd"}).json()
    assert res["direction"] in ("forward", "reverse", "weak")
    assert 0.0 <= res["score"] <= 1.0
