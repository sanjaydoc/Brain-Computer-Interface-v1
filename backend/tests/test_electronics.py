"""Tests for the Electronics port (schematic + BOM generation)."""

from __future__ import annotations

import pytest

from bci.electronics import ElectronicsService, compose_circuit, sanitize_circuit


def test_sanitize_drops_broken_and_duplicate_connections():
    raw = {
        "components": [{"id": "U1"}, {"id": "R1"}],
        "connections": [
            {"from": "U1", "to": "R1", "type": "power"},   # valid
            {"from": "U1", "to": "R1", "type": "data"},     # duplicate (same from→to) → dropped
            {"from": "U1", "to": "MISSING"},                # dangling → dropped
            {"from": "U1", "to": "U1"},                     # self → dropped
        ],
    }
    clean = sanitize_circuit(raw)
    assert len(clean["connections"]) == 1
    assert clean["connections"][0]["type"] == "power"


def test_compose_is_deterministic_and_wired():
    a = compose_circuit("EEG headset with 8 electrodes")
    b = compose_circuit("EEG headset with 8 electrodes")
    assert a == b                                   # deterministic
    ids = {c["id"] for c in a["components"]}
    assert "U1" in ids and any(c["type"] == "sensor" for c in a["components"])   # MCU + bio-AFE
    # every connection references real components
    for conn in a["connections"]:
        assert conn["from"] in ids and conn["to"] in ids


def test_service_fallback_always_returns_a_circuit():
    svc = ElectronicsService()
    assert svc.backends()["fallback"] is True
    res = svc.generate("ESP32 BCI node with IMU and OLED", backend="fallback")
    assert res["components"] and res["connections"]
    assert len(res["bom"]) == len(res["components"])
    assert res["schematic"]["nodes"] and res["schematic"]["edges"]
    assert res["backend"] == "fallback"


def test_keyword_match_is_word_anchored():
    # "stimulator" contains the substring "imu" — it must NOT pull in an IMU sensor.
    ids = {c["id"] for c in compose_circuit("EEG headset with stimulator")["components"]}
    assert "IMU1" not in ids
    # but a real IMU keyword still matches, and a prefix (temp→temperature) works
    assert "IMU1" in {c["id"] for c in compose_circuit("robot with IMU")["components"]}
    assert any(c["type"] == "sensor_temp" for c in compose_circuit("temperature logger")["components"])


def test_service_rejects_empty_concept():
    with pytest.raises(ValueError):
        ElectronicsService().generate("   ")


def test_electronics_api():
    pytest.importorskip("fastapi")
    from fastapi.testclient import TestClient
    from bci.api.app import app
    client = TestClient(app)

    assert client.get("/api/electronics/backends").json()["fallback"] is True
    gen = client.post("/api/electronics/generate",
                      json={"concept": "neural dust reader with stimulator", "backend": "fallback"}).json()
    assert gen["components"] and gen["bom"]
    ids = {c["id"] for c in gen["components"]}
    for e in gen["schematic"]["edges"]:
        assert e["from"] in ids and e["to"] in ids
