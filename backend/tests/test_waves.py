"""Tests for the wave-invention engine (rule-based fallback + sanitiser + API)."""

from __future__ import annotations

import pytest

from bci.waves import WaveInventor, compose_wave, sanitize_wave, MODES, WAVEFORMS


def test_compose_is_complementary_and_valid():
    w = compose_wave("map the whole brain including deep structures")
    assert 2 <= len(w["modes"]) <= 4
    assert all(m in MODES for m in w["modes"])
    assert w["waveform"] in WAVEFORMS
    assert 0.3 <= w["freq"] <= 2.0 and 1 <= w["amplitude"] <= 8 and w["sign"] in (1, -1)


def test_compose_reads_the_goal():
    surface = compose_wave("image the cortical surface only")
    assert "infrared" in surface["modes"]
    scan = compose_wave("scan and image the tissue")
    assert scan["waveform"] == "chirp"


def test_sanitize_drops_unknown_modes_and_clamps():
    w = sanitize_wave({"name": "X", "modes": ["ultrasound", "bogus", "ultrasound", "radio"],
                       "waveform": "weird", "freq": 9, "amplitude": 99, "sign": -3})
    assert w["modes"] == ["ultrasound", "radio"]      # unknown + dup dropped
    assert w["waveform"] == "pulse" and w["freq"] == 2.0 and w["amplitude"] == 8 and w["sign"] == -1


def test_inventor_fallback_always_returns_a_wave():
    inv = WaveInventor()
    assert inv.backends()["fallback"] is True
    w = inv.invent("non-invasive deep + surface coverage", backend="fallback")
    assert w["backend"] == "fallback" and len(w["modes"]) >= 2 and w["rationale"]


def test_inventor_rejects_empty_goal():
    with pytest.raises(ValueError):
        WaveInventor().invent("  ")


def test_waves_api():
    pytest.importorskip("fastapi")
    from fastapi.testclient import TestClient
    from bci.api.app import app
    client = TestClient(app)

    assert client.get("/api/waves/backends").json()["fallback"] is True
    w = client.post("/api/waves/invent", json={"goal": "cover blind spots in a mouse cortex", "backend": "fallback"}).json()
    assert len(w["modes"]) >= 2 and all(m in MODES for m in w["modes"])
