"""MolecularService — Part 1 adapter over De-Novo-LLM.

Three generation backends, tried in order for ``backend="auto"``:
  1. **local**  — a trained De-Novo-LLM checkpoint on your GPU (denovo.generate).
  2. **nim**    — NVIDIA NIM / BioNeMo cloud (denovo.nim, needs NVIDIA_API_KEY).
  3. **fallback** — bundled valid sequences (hosted web demo, CI, no ML stack).

Everything degrades gracefully so the "Generate" button always returns molecules.
"""

from __future__ import annotations

import os
from typing import List

from .channel import SonogeneticChannel
from .samples import FALLBACK


def _denovo_available() -> bool:
    try:
        import denovo  # noqa: F401
        return True
    except Exception:
        return False


def _torch_available() -> bool:
    try:
        import torch  # noqa: F401
        return True
    except Exception:
        return False


class MolecularService:
    def __init__(self, model_paths: dict | None = None) -> None:
        # map modality -> trained checkpoint dir (defaults to the modality's base model)
        self.model_paths = model_paths or {}

    # -- introspection -----------------------------------------------------
    def backends(self) -> dict:
        return {
            "local": _denovo_available() and _torch_available(),
            "nim": _denovo_available() and bool(os.environ.get("NVIDIA_API_KEY") or os.environ.get("NGC_API_KEY")),
            "fallback": True,
        }

    def _pick(self, backend: str) -> str:
        if backend != "auto":
            return backend
        b = self.backends()
        if b["local"]:
            return "local"
        if b["nim"]:
            return "nim"
        return "fallback"

    # -- generation --------------------------------------------------------
    def generate(self, modality: str = "smiles", n: int = 8, *, backend: str = "auto",
                 temperature: float = 1.0, seed: int = 42) -> dict:
        chosen = self._pick(backend)
        try:
            if chosen == "local":
                seqs = self._generate_local(modality, n, temperature, seed)
            elif chosen == "nim":
                seqs = self._generate_nim(modality, n)
            else:
                seqs = self._fallback(modality, n)
        except Exception as exc:  # any backend failure → fallback, but report it
            return {"sequences": self._fallback(modality, n), "backend": "fallback",
                    "note": f"{chosen} failed ({exc}); used fallback", "modality": modality}
        return {"sequences": seqs[:n], "backend": chosen, "modality": modality}

    def generate_channels(self, modality: str = "smiles", n: int = 8, *, target: str = "rev",
                          backend: str = "auto") -> dict:
        res = self.generate(modality, n, backend=backend)
        channels = [SonogeneticChannel.from_sequence(s, modality, i, target).to_dict()
                    for i, s in enumerate(res["sequences"])]
        return {**res, "channels": channels}

    # -- backends ----------------------------------------------------------
    def _generate_local(self, modality: str, n: int, temperature: float, seed: int) -> List[str]:
        from denovo.config import GenerateConfig
        from denovo.generate import generate
        from denovo.modalities import get_modality

        mod = get_modality(modality)
        model_path = self.model_paths.get(modality, mod.default_model)
        raw = generate(model_path, GenerateConfig(num_samples=n * 3, temperature=temperature),
                       seed=seed)
        valid = [c for c in (mod.canonicalize(s) for s in raw) if c]
        return list(dict.fromkeys(valid))  # dedup, keep order

    def _generate_nim(self, modality: str, n: int) -> List[str]:
        from denovo.nim import NIMClient

        client = NIMClient()
        if modality in ("smiles", "selfies"):
            seed_smi = FALLBACK["smiles"][0]
            mols = client.molmim_generate(seed_smi, num_molecules=n, algorithm="none")
            return [m["smiles"] for m in mols if m.get("smiles")]
        if modality in ("dna", "rna"):
            out = client.evo2_generate(FALLBACK["dna"][0], num_tokens=64)
            return [out] if out else self._fallback(modality, n)
        raise RuntimeError(f"NIM has no generator for modality '{modality}'")

    def _fallback(self, modality: str, n: int) -> List[str]:
        pool = FALLBACK.get(modality, FALLBACK["smiles"])
        out = []
        while len(out) < n:
            out.extend(pool)
        return out[:n]
