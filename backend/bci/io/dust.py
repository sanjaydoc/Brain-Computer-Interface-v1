"""Neural-dust reader — the READ path (NeuralInput).

Implanted piezo motes report neural activity via ultrasonic backscatter. v1 is the
idealized case: one mote per neuron, reading smoothed activity plus backscatter noise.
The `realistic` variant (sparse motes pooling neighborhoods) drops in behind this same
interface later.
"""

from __future__ import annotations

import numpy as np

from .contracts import inputs


@inputs.register("simulated_dust")
class DustReader:
    def __init__(self, n: int, noise: float = 0.01, seed: int = 0) -> None:
        self.n = int(n)
        self.noise = float(noise)
        self.rng = np.random.default_rng(seed)

    def read(self, engine) -> np.ndarray:
        readout = engine.activity.copy()
        if self.noise:
            readout += self.rng.normal(0, self.noise, self.n).astype(np.float32)
        return np.clip(readout, 0.0, None)
