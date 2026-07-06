"""Export a connectome to a compact JSON the zero-build GUI loads (demo mode).

Writes docs/app/data/<name>.json with parallel arrays (compact) so the Three.js viewer
can render it with no backend — matching the LabSuite live/demo dual-mode pattern.

Run:  .venv/bin/python scripts/export_web.py celegans
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from bci.connectome import sources  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / "docs" / "app" / "data"
OUT.mkdir(parents=True, exist_ok=True)


def export(impl: str, name: str) -> None:
    c = sources.create(impl).load()
    coo = c.weights.tocoo()
    # out-degree per neuron (for coloring hubs)
    outdeg = [int(x) for x in c.weights.getnnz(axis=1).ravel()]
    data = {
        "name": name,
        "n_neurons": c.n_neurons,
        "n_synapses": c.n_synapses,
        "ids": c.ids.tolist(),
        "types": c.types.tolist(),
        "pos": [[round(float(v), 3) for v in row] for row in c.pos],
        "outdeg": outdeg,
        "edges": [[int(i), int(j)] for i, j in zip(coo.row.tolist(), coo.col.tolist())],
    }
    path = OUT / f"{name}.json"
    path.write_text(json.dumps(data, separators=(",", ":")))
    print(f"wrote {path}  ({c.n_neurons} neurons, {c.n_synapses} edges, {path.stat().st_size//1024} KB)")


if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "celegans"
    export(which, "celegans" if which == "celegans" else which)
