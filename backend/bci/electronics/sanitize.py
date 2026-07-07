"""Circuit sanitiser + BOM / schematic builders — ported from inventor-studio-v3
``routes/electronics.js`` (``sanitizeCircuit`` and the ``generateHandler`` shaping).

Drops broken/duplicate connections, normalises component ids, then derives the bill of
materials and the node/edge schematic the frontend renders.
"""

from __future__ import annotations

from typing import Any


def sanitize_circuit(circuit_data: dict[str, Any] | None) -> dict[str, list]:
    """Normalise ids, drop connections that reference missing/duplicate/self ids."""
    comps = (circuit_data or {}).get("components") or []
    normalized: list[dict] = []
    for i, c in enumerate(comps):
        c = dict(c)
        c["id"] = str(c.get("id") or f"C{i + 1}").strip()
        normalized.append(c)
    ids = {c["id"] for c in normalized}

    seen: set[str] = set()
    conns: list[dict] = []
    for conn in (circuit_data or {}).get("connections") or []:
        frm = str(conn.get("from") or "").strip()
        to = str(conn.get("to") or "").strip()
        if not frm or not to or frm == to or frm not in ids or to not in ids:
            continue
        key = f"{frm}→{to}"
        if key in seen:
            continue
        seen.add(key)
        conns.append({
            "from": frm,
            "to": to,
            "fromPin": str(conn.get("fromPin") or "").strip(),
            "toPin": str(conn.get("toPin") or "").strip(),
            "type": "power" if conn.get("type") == "power" else "data",
            "label": str(conn.get("label") or "")[:40],
        })
    return {"components": normalized, "connections": conns}


def build_bom(components: list[dict]) -> list[dict]:
    return [{
        "id": c["id"],
        "name": c.get("name") or "Component",
        "model": c.get("model") or "",
        "type": c.get("type") or "module",
        "category": c.get("category") or "MODULE",
        "specs": c.get("specs") or "",
        "quantity": c.get("quantity") or 1,
        "pins": c.get("pins") if isinstance(c.get("pins"), list) else [],
    } for c in components]


def build_schematic(components: list[dict], connections: list[dict]) -> dict:
    """Node/edge shape (positions from the component x/y, grid fallback)."""
    nodes = []
    for i, c in enumerate(components):
        x = c["x"] if isinstance(c.get("x"), (int, float)) else 80 + (i % 4) * 240
        y = c["y"] if isinstance(c.get("y"), (int, float)) else 80 + (i // 4) * 240
        nodes.append({"id": c["id"], "type": "component", "position": {"x": x, "y": y}, "data": dict(c)})
    edges = [{
        "id": f"e{i}", "from": conn["from"], "to": conn["to"],
        "fromPin": conn.get("fromPin", ""), "toPin": conn.get("toPin", ""),
        "type": conn["type"], "label": conn.get("label", ""),
    } for i, conn in enumerate(connections)]
    return {"nodes": nodes, "edges": edges}
