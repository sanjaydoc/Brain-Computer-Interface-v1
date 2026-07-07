"""Normalize a Drosophila connectome into the CSV cache (the rung after MICrONS).

Works from the publicly downloadable **FlyWire Codex** data dump (https://codex.flywire.ai/
→ Downloads): a neurons table (root_id, position, cell_type) and a connections table
(pre_root_id, post_root_id, syn_count). Column names are detected flexibly so hemibrain /
larval exports also work.

    python scripts/fetch_drosophila.py --neurons neurons.csv --connections connections.csv --max-neurons 20000

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
    for c in cands:
        for k in row:
            if k.lower() == c:
                return row[k]
    return default


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--neurons", required=True, help="FlyWire/hemibrain neurons CSV")
    ap.add_argument("--connections", required=True, help="connections CSV (pre,post,syn_count)")
    ap.add_argument("--max-neurons", type=int, default=20000)
    args = ap.parse_args()

    # 1) connections → aggregate weights, rank neurons by total connectivity
    weight, deg = {}, {}
    with open(args.connections, newline="") as f:
        for row in csv.DictReader(f):
            a = str(_col(row, "pre_root_id", "pre_pt_root_id", "bodyid_pre", "source"))
            b = str(_col(row, "post_root_id", "post_pt_root_id", "bodyid_post", "target"))
            c = float(_col(row, "syn_count", "weight", "count", default=1) or 1)
            if not a or not b or a == b:
                continue
            weight[(a, b)] = weight.get((a, b), 0.0) + c
            deg[a] = deg.get(a, 0.0) + c; deg[b] = deg.get(b, 0.0) + c

    keep = set(sorted(deg, key=deg.get, reverse=True)[: args.max_neurons])
    print(f"neurons in connections: {len(deg)} → keeping top {len(keep)} by connectivity")

    # 2) neurons → positions + types (only the kept set)
    OUT.mkdir(parents=True, exist_ok=True)
    pos, types = {}, {}
    with open(args.neurons, newline="") as f:
        for row in csv.DictReader(f):
            rid = str(_col(row, "root_id", "pt_root_id", "bodyid", "id"))
            if rid not in keep:
                continue
            p = _col(row, "position", "pos", default=None)
            if p and "," in str(p):
                xyz = [float(v) for v in str(p).strip("[]() ").split(",")[:3]]
            else:
                xyz = [float(_col(row, "pos_x", "x", default=0) or 0),
                       float(_col(row, "pos_y", "y", default=0) or 0),
                       float(_col(row, "pos_z", "z", default=0) or 0)]
            pos[rid] = xyz
            types[rid] = str(_col(row, "cell_type", "type", "super_class", default="neuron"))

    with open(OUT / "neurons.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(["id", "type", "x", "y", "z"])
        for rid, (x, y, z) in pos.items():
            w.writerow([rid, types.get(rid, "neuron"), x, y, z])
    rows = 0
    with open(OUT / "synapses.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(["pre", "post", "kind", "weight"])
        for (a, b), c in weight.items():
            if a in pos and b in pos:
                w.writerow([a, b, "chemical", c]); rows += 1
    print(f"wrote {len(pos)} neurons, {rows} connections")

    _export_web(pos, weight, types)


def _export_web(pos: dict, weight: dict, types: dict) -> None:
    import numpy as np
    ids = list(pos.keys()); index = {r: i for i, r in enumerate(ids)}
    a = np.array([pos[r] for r in ids], dtype=float)
    a -= a.mean(axis=0); a /= (a.std() + 1e-9)
    edges = [[index[x], index[y], float(c)] for (x, y), c in weight.items() if x in index and y in index]
    outdeg = [0] * len(ids)
    for e in edges:
        outdeg[e[0]] += 1
    data = {
        "name": f"Drosophila · {len(ids):,}", "n_neurons": len(ids), "n_synapses": len(edges),
        "ids": ids, "types": [types.get(r, "neuron") for r in ids],
        "pos": [[round(float(v) * 60, 2) for v in row] for row in a],
        "outdeg": outdeg, "edges": edges,
    }
    WEB.parent.mkdir(parents=True, exist_ok=True)
    WEB.write_text(json.dumps(data, separators=(",", ":")))
    print(f"wrote {WEB}  ({len(ids)} neurons, {len(edges)} edges, {WEB.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
