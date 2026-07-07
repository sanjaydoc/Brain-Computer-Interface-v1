"""Neuron models — the `NeuronModel` seam (PLAN §2.2), vectorized over SoA arrays.

v1 ships LIF; Hodgkin–Huxley drops into the same interface later. All state is columnar
numpy arrays (Scalability Contract §2.3 rule 1); one step is O(N).
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

import numpy as np

from ..registry import Registry


@runtime_checkable
class NeuronModel(Protocol):
    v: np.ndarray
    activity: np.ndarray

    def step(self, current: np.ndarray, dt: float) -> np.ndarray:
        """Advance one step given per-neuron input current; return a bool spike array."""
        ...

    def reset(self) -> None: ...


models: Registry[NeuronModel] = Registry("neuron-model")


@models.register("lif")
class LIFModel:
    """Leaky integrate-and-fire. Membrane leaks toward rest; a spike resets + refracts."""

    def __init__(
        self,
        n: int,
        tau: float = 20.0,
        v_threshold: float = 1.0,
        v_reset: float = 0.0,
        refractory: int = 4,
        v_floor: float = -0.5,
    ) -> None:
        self.n = int(n)
        self.tau = float(tau)
        self.vth = float(v_threshold)
        self.vreset = float(v_reset)
        self.refr_len = int(refractory)
        self.v_floor = float(v_floor)
        self.v = np.zeros(n, dtype=np.float32)
        self.refr = np.zeros(n, dtype=np.int32)
        self.activity = np.zeros(n, dtype=np.float32)

    def step(self, current: np.ndarray, dt: float = 1.0) -> np.ndarray:
        active = self.refr <= 0
        # leak + input for non-refractory neurons; hold refractory neurons at reset
        self.v[~active] = self.vreset
        self.v[active] += dt * (-self.v[active] / self.tau) + current[active]
        np.maximum(self.v, self.v_floor, out=self.v)

        spikes = active & (self.v >= self.vth)
        self.v[spikes] = self.vreset
        self.refr[spikes] = self.refr_len
        np.subtract(self.refr, 1, out=self.refr, where=self.refr > 0)

        # smoothed activity for readout/coloring — spike-driven
        self.activity *= 0.93
        self.activity[spikes] += 0.5
        return spikes

    def reset(self) -> None:
        self.v.fill(0)
        self.refr.fill(0)
        self.activity.fill(0)


@models.register("hodgkin_huxley")
class HodgkinHuxleyModel:
    """Biophysical Hodgkin–Huxley neurons (classic squid-axon params), vectorized over
    SoA arrays. Drop-in for LIF behind the same interface — the plan's upgrade path
    (PROJECT_PLAN §7). Membrane in mV; the engine's dimensionless drive is scaled to an
    injected current, and the HH ODEs are sub-stepped per engine tick for stability.
    """

    # standard parameters
    C_M = 1.0
    G_NA, G_K, G_L = 120.0, 36.0, 0.3
    E_NA, E_K, E_L = 50.0, -77.0, -54.387
    V_REST, V_SPIKE = -65.0, 0.0     # rest; upward-crossing threshold for a spike

    def __init__(self, n: int, input_scale: float = 22.0, substeps: int = 20) -> None:
        self.n = int(n)
        self.input_scale = float(input_scale)
        self.substeps = int(substeps)
        self.v = np.full(n, self.V_REST, dtype=np.float32)
        am, bm, ah, bh, an, bn = self._rates(self.v)
        self.m = am / (am + bm)
        self.h = ah / (ah + bh)
        self.ngate = an / (an + bn)
        self.above = np.zeros(n, dtype=bool)      # for spike edge-detection
        self.activity = np.zeros(n, dtype=np.float32)

    @staticmethod
    def _safe(num: np.ndarray, den: np.ndarray, limit: float) -> np.ndarray:
        # α/β rate functions have 0/0 singularities; use the analytic limit there.
        return np.where(np.abs(den) < 1e-6, limit, num / den)

    def _rates(self, v: np.ndarray):
        am = self._safe(0.1 * (v + 40.0), 1.0 - np.exp(-(v + 40.0) / 10.0), 1.0)
        bm = 4.0 * np.exp(-(v + 65.0) / 18.0)
        ah = 0.07 * np.exp(-(v + 65.0) / 20.0)
        bh = 1.0 / (1.0 + np.exp(-(v + 35.0) / 10.0))
        an = self._safe(0.01 * (v + 55.0), 1.0 - np.exp(-(v + 55.0) / 10.0), 0.1)
        bn = 0.125 * np.exp(-(v + 65.0) / 80.0)
        return am, bm, ah, bh, an, bn

    def step(self, current: np.ndarray, dt: float = 1.0) -> np.ndarray:
        I = current.astype(np.float32) * self.input_scale
        h = dt / self.substeps
        spikes = np.zeros(self.n, dtype=bool)
        for _ in range(self.substeps):
            am, bm, ah, bh, an, bn = self._rates(self.v)
            self.m = np.clip(self.m + h * (am * (1 - self.m) - bm * self.m), 0.0, 1.0)
            self.h = np.clip(self.h + h * (ah * (1 - self.h) - bh * self.h), 0.0, 1.0)
            self.ngate = np.clip(self.ngate + h * (an * (1 - self.ngate) - bn * self.ngate), 0.0, 1.0)
            i_na = self.G_NA * self.m ** 3 * self.h * (self.v - self.E_NA)
            i_k = self.G_K * self.ngate ** 4 * (self.v - self.E_K)
            i_l = self.G_L * (self.v - self.E_L)
            self.v = self.v + h * (I - i_na - i_k - i_l) / self.C_M
            crossed = (self.v >= self.V_SPIKE) & ~self.above
            spikes |= crossed
            self.above = self.v >= self.V_SPIKE
        self.activity = self.activity * 0.93 + spikes * 0.5
        return spikes

    def reset(self) -> None:
        self.v.fill(self.V_REST)
        am, bm, ah, bh, an, bn = self._rates(self.v)
        self.m = am / (am + bm)
        self.h = ah / (ah + bh)
        self.ngate = an / (an + bn)
        self.above.fill(False)
        self.activity.fill(0)
