"""The signal I/O contracts + their registries.

These are the seams a real neural-dust array / sonogenetic ultrasound rig will implement.
In v1 the simulated adapters (dust.py, sono.py) implement them against the Engine.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

import numpy as np

from ..registry import Registry


@runtime_checkable
class NeuralOutput(Protocol):
    """WRITE path — device → brain. Sonogenetics opens ultrasound-gated channels."""

    def write(self, engine, indices, amount: float) -> None: ...


@runtime_checkable
class NeuralInput(Protocol):
    """READ path — brain → device. Neural dust backscatter → per-mote readout."""

    def read(self, engine) -> np.ndarray: ...


outputs: Registry[NeuralOutput] = Registry("neural-output")
inputs: Registry[NeuralInput] = Registry("neural-input")
