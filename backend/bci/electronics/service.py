"""ElectronicsService — Part (Electronics) adapter, ported from inventor-studio-v3.

Two backends, tried in order for ``backend="auto"``:
  1. **llm**      — an LLM emits components + connections from the concept (needs an API key).
  2. **fallback** — the deterministic rule-based composer (no network / hosted demo / CI).

Both paths flow through the same sanitiser → BOM → schematic, so the output shape is
identical. Like MolecularService, it degrades gracefully: "Generate" always returns a circuit.
"""

from __future__ import annotations

import json
import re

from . import llm
from .compose import compose_circuit
from .prompt import build_circuit_prompt
from .sanitize import build_bom, build_schematic, sanitize_circuit


class ElectronicsService:
    # -- introspection -----------------------------------------------------
    def backends(self) -> dict:
        return {"llm": llm.available(), "fallback": True}

    def _pick(self, backend: str) -> str:
        if backend != "auto":
            return backend
        return "llm" if llm.available() else "fallback"

    # -- generation --------------------------------------------------------
    def generate(self, concept: str, *, backend: str = "auto") -> dict:
        concept = (concept or "").strip()
        if not concept:
            raise ValueError("concept is required")

        chosen = self._pick(backend)
        note = None
        if chosen == "llm":
            try:
                raw = self._generate_llm(concept)
            except Exception as exc:  # any failure → deterministic composer
                raw, chosen, note = compose_circuit(concept), "fallback", f"llm failed ({exc}); used fallback"
        else:
            raw = compose_circuit(concept)

        clean = sanitize_circuit(raw)
        components, connections = clean["components"], clean["connections"]
        out = {
            "title": raw.get("title") or concept[:80],
            "description": raw.get("description") or concept,
            "components": components,
            "connections": connections,
            "bom": build_bom(components),
            "schematic": build_schematic(components, connections),
            "backend": chosen,
        }
        if note:
            out["note"] = note
        return out

    def _generate_llm(self, concept: str) -> dict:
        text = llm.invoke_json(build_circuit_prompt(concept), max_tokens=2500)
        parsed = _parse_json(text)
        if not parsed or not parsed.get("components"):
            raise RuntimeError("LLM returned no components")
        return parsed


def _parse_json(text: str) -> dict | None:
    try:
        return json.loads(text)
    except Exception:
        m = re.search(r"\{[\s\S]*\}", str(text))
        if m:
            try:
                return json.loads(m.group(0))
            except Exception:
                return None
    return None
