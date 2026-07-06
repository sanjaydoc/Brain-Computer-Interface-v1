"""AddressingModel — the granularity seam (PLAN §6.4).

Maps intended target neurons → an effective per-neuron dose. v1 ships `idealized`
(per-neuron, delta focus, full expression). The `realistic` variant (focal blur ×
sonogenetic expression × mote pooling) drops in behind the same interface later.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

import numpy as np

from ..registry import Registry


@runtime_checkable
class AddressingModel(Protocol):
    def dose(self, indices, amount: float): ...


addressers: Registry[AddressingModel] = Registry("addressing")


@addressers.register("idealized")
class IdealizedAddressing:
    """Per-neuron addressing. dose = amount × expression, delta-function focus.

    `expression` is the sonogenetic expression mask (which neurons carry the channel
    De-Novo-LLM designed) — defaults to all neurons expressing.
    """

    def __init__(self, n: int, expression: np.ndarray | None = None) -> None:
        self.n = int(n)
        self.expression = (
            np.ones(n, dtype=np.float32) if expression is None
            else np.asarray(expression, dtype=np.float32)
        )

    def dose(self, indices, amount: float):
        idx = np.asarray(indices, dtype=np.int64)
        return idx, amount * self.expression[idx]
