"""Normalize the FlyWire *Drosophila* connectome into the CSV cache (Rung 2b).

FlyWire's Codex (https://codex.flywire.ai/ → Downloads) splits the data across files. You
need two, plus an optional third:

    Connections (Filtered)        →  --connections   (required; the wiring)
    Marked Neuron Coordinates     →  --coordinates    (required for real 3D anatomy)
    Cell Types                    →  --types          (optional; colours neurons by type)

    python scripts/fetch_drosophila.py \\
        --connections "Connections (Filtered).csv" \\
        --coordinates "Marked Neuron Coordinates.csv" \\
        --types "Cell Types.csv" \\
        --max-neurons 20000

(You can still pass a single combined table via --neurons instead of --coordinates/--types;
column names are detected flexibly, so hemibrain / larval exports also work.)

Writes data/connectomes/drosophila/{neurons,synapses}.csv and docs/app/data/drosophila.json.
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "connectomes" / "drosophila"
WEB = ROOT / "docs" / "app" / "data" / "drosophila.json"


def _col(row: dict, *cands, default=None):
    """Case-insensitive column lookup; skips blank cells so a present-but-empty column
    falls through to the next candidate."""
    for c in cands:
        for k in row:
            if k.lower() == c and str(row[k]).strip():
                return row[k]
    return default


def _xyz(row: dict):
    """Parse a FlyWire position — either a '[x, y, z]' / 'x y z' string or separate columns."""
    p = _col(row, "position", "pos", "pt_position", "xyz", default=None)
    if p:
        s = str(p).strip("[]() ").replace(",", " ")
        parts = [v for v in s.split() if v]
        if len(parts) >= 3:
            try:
                return [float(parts[0]), float(parts[1]), float(parts[2])]
            except ValueError:
                pass
    xs = _col(row, "pos_x", "x", "pt_position_x", default=None)
    if xs is not None:
        return [float(xs or 0),
                float(_col(row, "pos_y", "y", "pt_position_y", default=0) or 0),
                float(_col(row, "pos_z", "z", "pt_position_z", default=0) or 0)]
    return None


_TYPE_COLS = ("cell_type", "primary_type", "type", "super_class", "class")


def _read_rooted(path, want_pos, want_type, pos, types, keep, type_cols=_TYPE_COLS):
    """Scan a FlyWire table keyed by root_id, filling pos/types for the kept neurons.
    `type_cols` sets which label column wins (classification passes super_class first)."""
    with open(path, newline="") as f:
        for row in csv.DictReader(f):
            rid = str(_col(row, "root_id", "pt_root_id", "bodyid", "id", default="")).strip()
            if not rid or rid not in keep:
                continue
            if want_pos and rid not in pos:
                xyz = _xyz(row)
                if xyz is not None:
                    pos[rid] = xyz
            if want_type and rid not in types:
                t = _col(row, *type_cols, default=None)
                if t:
                    types[rid] = str(t)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--connections", required=True, help="Connections (Filtered) CSV")
    ap.add_argument("--coordinates", help="Marked Neuron Coordinates CSV (positions)")
    ap.add_argument("--types", help="Cell Types CSV (labels)")
    ap.add_argument("--classification", help="Classification / Hierarchical Annotations CSV "
                    "(super_class → grouping, takes priority for the label)")
    ap.add_argument("--neurotransmitters", help="Neurotransmitter Type Predictions CSV "
                    "(→ excitatory/inhibitory sign)")
    ap.add_argument("--neurons", help="legacy: one combined neurons table (position + type)")
    ap.add_argument("--max-neurons", type=int, default=20000)
    args = ap.parse_args()

    # 1) connections → aggregate weights, rank neurons by total connectivity
    weight, deg = {}, {}
    with open(args.connections, newline="") as f:
        for row in csv.DictReader(f):
            a = str(_col(row, "pre_root_id", "pre_pt_root_id", "bodyid_pre", "source", default="")).strip()
            b = str(_col(row, "post_root_id", "post_pt_root_id", "bodyid_post", "target", default="")).strip()
            c = float(_col(row, "syn_count", "weight", "count", "synapses", default=1) or 1)
            if not a or not b or a == b:
                continue
            weight[(a, b)] = weight.get((a, b), 0.0) + c
            deg[a] = deg.get(a, 0.0) + c
            deg[b] = deg.get(b, 0.0) + c

    keep = set(sorted(deg, key=deg.get, reverse=True)[: args.max_neurons])
    print(f"neurons in connections: {len(deg):,} → keeping top {len(keep):,} by connectivity")

    # 2) positions + labels. Classification's super_class wins the label (coarse, meaningful
    #    groups); Cell Types / combined file fill any gaps. Coordinates give real positions.
    OUT.mkdir(parents=True, exist_ok=True)
    pos, types = {}, {}
    for path in filter(None, [args.classification]):
        _read_rooted(path, want_pos=False, want_type=True, pos=pos, types=types, keep=keep,
                     type_cols=("super_class", "class", "cell_type", "primary_type", "type"))
    for path in filter(None, [args.neurons, args.coordinates]):
        _read_rooted(path, want_pos=True, want_type=True, pos=pos, types=types, keep=keep)
    for path in filter(None, [args.types]):
        _read_rooted(path, want_pos=False, want_type=True, pos=pos, types=types, keep=keep)

    # 2b) neurotransmitter → sign (ACh excites; GABA / glutamate inhibit; monoamines modulate)
    nt = {}
    if args.neurotransmitters:
        with open(args.neurotransmitters, newline="") as f:
            for row in csv.DictReader(f):
                rid = str(_col(row, "root_id", "pt_root_id", "id", default="")).strip()
                if rid in keep:
                    t = _col(row, "nt_type", "neurotransmitter", "top_nt", "nt", default=None)
                    if t:
                        nt[rid] = str(t)
        print(f"  neurotransmitter labels for {len(nt):,} neurons "
              f"→ {sum(1 for v in nt.values() if str(v).upper() in ('GABA', 'GLUT', 'GLUTAMATE')):,} inhibitory")

    # neurons with no coordinate get a deterministic fallback point (keeps the graph whole)
    missing = [rid for rid in keep if rid not in pos]
    if missing:
        import numpy as np
        rng = np.random.default_rng(0)
        center, scale = np.zeros(3), 1.0
        if pos:  # sit fallbacks inside the real coordinate cloud, not off at the origin
            arr = np.array(list(pos.values()), dtype=float)
            center, scale = arr.mean(axis=0), float(arr.std()) or 1.0
        for rid in missing:
            pos[rid] = (center + rng.normal(size=3) * scale).tolist()
        print(f"  {len(missing):,} kept neurons had no coordinate → deterministic fallback layout")

    with open(OUT / "neurons.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "type", "x", "y", "z", "nt"])
        for rid in keep:
            x, y, z = pos[rid]
            w.writerow([rid, types.get(rid, "neuron"), x, y, z, nt.get(rid, "")])
    rows = 0
    with open(OUT / "synapses.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["pre", "post", "kind", "weight"])
        for (a, b), c in weight.items():
            if a in keep and b in keep:
                w.writerow([a, b, "chemical", c])
                rows += 1
    print(f"wrote {len(keep):,} neurons, {rows:,} connections")

    _export_web(keep, pos, weight, types, nt)


def _export_web(keep: set, pos: dict, weight: dict, types: dict, nt: dict) -> None:
    import numpy as np
    ids = list(keep)
    index = {r: i for i, r in enumerate(ids)}
    a = np.array([pos[r] for r in ids], dtype=float)
    a -= a.mean(axis=0)
    a /= (a.std() + 1e-9)
    edges = [[index[x], index[y], float(c)] for (x, y), c in weight.items() if x in index and y in index]
    outdeg = [0] * len(ids)
    for e in edges:
        outdeg[e[0]] += 1
    data = {
        "name": f"Drosophila · {len(ids):,}", "n_neurons": len(ids), "n_synapses": len(edges),
        "ids": ids, "types": [types.get(r, "neuron") for r in ids],
        "nt": [str(nt.get(r, "")) for r in ids],  # neurotransmitter per neuron (excit/inhib)
        "pos": [[round(float(v) * 60, 2) for v in row] for row in a],
        "outdeg": outdeg, "edges": edges,
    }
    WEB.parent.mkdir(parents=True, exist_ok=True)
    WEB.write_text(json.dumps(data, separators=(",", ":")))
    print(f"wrote {WEB}  ({len(ids):,} neurons, {len(edges):,} edges, {WEB.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
