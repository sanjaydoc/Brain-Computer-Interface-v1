"""Tests for the FastAPI REST + WebSocket live API."""

from __future__ import annotations

import pytest

pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402

from bci.api.app import app  # noqa: E402

client = TestClient(app)


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert "celegans" in body["sources"]


def test_connectome_rest():
    r = client.get("/api/connectome/celegans")
    body = r.json()
    assert body["n_neurons"] == 302
    assert len(body["pos"]) == 302
    assert len(body["edges"]) == body["n_synapses"]


def test_websocket_streams_and_responds_to_stimulus():
    with client.websocket_connect("/ws?connectome=celegans") as ws:
        first = ws.receive_json()
        assert len(first["activity"]) == 302
        # drive the reverse command and watch locomotion go negative on the stream
        ws.send_json({"cmd": "stimulate", "role": "rev", "amount": 3.4})
        min_loco = 0.0
        for _ in range(40):
            frame = ws.receive_json()
            min_loco = min(min_loco, frame["locomotion"])
        assert min_loco < -0.05   # reversal emerged and streamed back
