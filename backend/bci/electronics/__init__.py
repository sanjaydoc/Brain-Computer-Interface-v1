"""Electronics (schematic + PCB) — LLM/rule-based circuit generation.

Ported from inventor-studio-v3 (Node → Python): the circuit prompt, the sanitiser and the
BOM/schematic shaping, plus a deterministic rule-based composer so generation works with no
LLM (hosted demo / CI), mirroring the MolecularService fallback pattern.
"""

from .service import ElectronicsService
from .sanitize import sanitize_circuit, build_bom, build_schematic
from .compose import compose_circuit
from .prompt import build_circuit_prompt

__all__ = [
    "ElectronicsService",
    "sanitize_circuit",
    "build_bom",
    "build_schematic",
    "compose_circuit",
    "build_circuit_prompt",
]
