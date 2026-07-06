"""Signal I/O — the Part-2 hardware contracts (PLAN §6.2).

WRITE path = sonogenetics (device → sim), READ path = neural dust (sim → device).
v1 ships simulated adapters behind the same interfaces real hardware will implement.
"""

from .addressing import AddressingModel, addressers
from .contracts import NeuralInput, NeuralOutput, inputs, outputs
from . import sono  # noqa: F401  — registers "simulated_sono"
from . import dust  # noqa: F401  — registers "simulated_dust"

__all__ = [
    "AddressingModel", "addressers", "NeuralInput", "NeuralOutput", "inputs", "outputs",
]
