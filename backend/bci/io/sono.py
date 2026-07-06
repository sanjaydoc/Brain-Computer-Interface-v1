"""Sonogenetic writer — the WRITE path (NeuralOutput).

Focused ultrasound opens the sonogenetic channels on target neurons. Here that means
injecting stimulus current into the engine, shaped by the addressing model (which
encodes focal precision × expression).
"""

from __future__ import annotations

import numpy as np

from .addressing import IdealizedAddressing, addressers  # noqa: F401
from .contracts import outputs


@outputs.register("simulated_sono")
class SonoWriter:
    def __init__(self, addressing=None, n: int | None = None) -> None:
        if addressing is None:
            if n is None:
                raise ValueError("SonoWriter needs an addressing model or n")
            addressing = IdealizedAddressing(n)
        self.addr = addressing

    def write(self, engine, indices, amount: float = 3.0) -> None:
        idx, dose = self.addr.dose(indices, amount)
        engine.stim[idx] += dose.astype(np.float32)
