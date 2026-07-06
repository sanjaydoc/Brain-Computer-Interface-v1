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
