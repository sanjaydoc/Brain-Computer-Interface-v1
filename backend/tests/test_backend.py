"""Tests for the simulation engine, I/O contracts, and the full runtime loop."""

from __future__ import annotations

import time

import numpy as np

from bci.connectome import sources
from bci.simulation import Engine, neuron_models
from bci.simulation.stepper import build_transpose
from bci.io import inputs, outputs
from bci.io.addressing import IdealizedAddressing
from bci.runtime import Runtime


# --- neuron model ------------------------------------------------------------
def test_lif_fires_under_drive_and_refracts():
    m = neuron_models.create("lif", n=5, refractory=4)
    spikes = np.zeros(5, dtype=bool)
    fired_once = False
    for _ in range(50):
        s = m.step(np.full(5, 0.2, dtype=np.float32))
        fired_once |= s.any()
    assert fired_once                      # constant drive eventually fires
    assert (m.activity >= 0).all()


def test_hodgkin_huxley_produces_action_potentials():
    m = neuron_models.create("hodgkin_huxley", n=3)
    vmax, spikes = -100.0, 0
    for _ in range(200):
        s = m.step(np.full(3, 0.5, dtype=np.float32), dt=1.0)
        vmax = max(vmax, float(m.v.max()))
        spikes += int(s[0])
    assert vmax > 20.0        # a real action potential overshoots well above 0 mV
    assert spikes >= 5        # repetitive firing under sustained current


def test_hodgkin_huxley_is_a_drop_in_engine_model():
    from bci.simulation import Engine
    c = sources.create("celegans").load()
    eng = Engine(c, neuron_impl="hodgkin_huxley", seed=1)
    for _ in range(150):
        eng.step()
    eng.inject_role("rev", 3.0)
    for _ in range(60):
        eng.step()
    assert eng.locomotion() < -0.05    # reversal emerges under HH too


# --- stepper: row normalization ---------------------------------------------
def test_row_normalization_bounds_input():
    c = sources.create("synthetic", n=200, avg_degree=10, seed=0).load()
    sign = np.ones(c.n_neurons, dtype=np.float32)
    wt = build_transpose(c.weights, sign, row_normalize=True)
    row_sums = np.abs(wt).sum(axis=1).A.ravel()
    nz = row_sums[row_sums > 0]
    assert np.allclose(nz, 1.0, atol=1e-5)   # each neuron's incoming weight sums to 1


# --- the key behavioural test: locomotion emerges from the connectome --------
def test_locomotion_emerges_from_command_neurons():
    c = sources.create("celegans").load()

    def drive(role):
        eng = Engine(c, seed=1)
        for _ in range(80):
            eng.step()
        eng.inject_role(role, 3.4)
        for _ in range(60):
            eng.step()
        return eng.locomotion()

    fwd = drive("fwd")
    rev = drive("rev")
    assert fwd > 0.1, f"driving forward command should give forward locomotion, got {fwd}"
    assert rev < -0.1, f"driving reverse command should give reverse locomotion, got {rev}"


# --- I/O contracts -----------------------------------------------------------
def test_sono_write_and_dust_read():
    c = sources.create("celegans").load()
    eng = Engine(c)
    writer = outputs.create("simulated_sono", addressing=IdealizedAddressing(eng.n))
    reader = inputs.create("simulated_dust", n=eng.n)

    idx = eng.role_idx["fwd"]
    writer.write(eng, idx, 3.0)
    assert eng.stim[idx].min() > 0            # sono injected current
    readout = reader.read(eng)
    assert readout.shape == (eng.n,)
    assert (readout >= 0).all()               # dust readout non-negative


# --- full runtime loop -------------------------------------------------------
def test_runtime_scripted_event_drives_behaviour():
    rt = Runtime.build(events=[{"t": 60, "role": "rev", "amount": 3.4}])
    for _ in range(140):
        rt.step()
    assert rt.snapshot()["locomotion"] < -0.05   # reversal was driven by the environment


# --- scalability: engine builds + steps a large connectome -------------------
def test_engine_scales_to_50k():
    c = sources.create("synthetic", n=50_000, avg_degree=10, seed=0).load()
    t0 = time.perf_counter()
    eng = Engine(c)
    for _ in range(20):
        eng.step()
    dt = time.perf_counter() - t0
    assert eng.n == 50_000
    assert dt < 20.0, f"50k-neuron sim too slow ({dt:.1f}s) — scalability regression"
