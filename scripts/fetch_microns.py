"""Fetch + normalize the MICrONS mouse cortical column (Rung 2) into the CSV cache.

Prerequisites (on a machine with internet):
    pip install caveclient
    # one-time free token from https://api.em.brain.allentech.org/  (CAVE):
    python -c "from caveclient import CAVEclient; CAVEclient('minnie65_public').auth.setup_token(make_new=True)"

Then:
    python scripts/fetch_microns.py --max-neurons 20000

Downloads proofread neurons + soma positions + the synapses among them from the
`minnie65_public` datastack, downsamples to a browser-tractable subset, writes
data/connectomes/microns/{neurons,synapses}.csv and docs/app/data/microns.json.

The full volume is ~200k neurons / ~500M synapses — far too much for a browser, so we keep
a proofread, downsampled subset. The Python engine can use larger subsets headless.
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "connectomes" / "microns"
WEB = ROOT / "docs" / "app" / "data" / "microns.json"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-neurons", type=int, default=20000)
    ap.add_argument("--datastack", default="minnie65_public")
    args = ap.parse_args()

    try:
        from caveclient import CAVEclient
    except ImportError:
        raise SystemExit("Install caveclient first:  pip install caveclient")

    client = CAVEclient(args.datastack)
    print(f"connected to {args.datastack} (materialization v{client.materialize.version})")

    # 1) proofread neurons (clean, complete morphologies)
    pr = client.materialize.query_table("proofreading_status_public_release")
    root_ids = list(pr["valid_id"].unique())[: args.max_neurons]
    keep = set(int(r) for r in root_ids)
    print(f"proofread neurons: {len(pr)}  → keeping {len(keep)}")

    # 2) soma positions + cell types
    nuc = client.materialize.query_table("nucleus_detection_v0")
    nuc = nuc[nuc["pt_root_id"].isin(keep)]
    vox = client.info.viewer_resolution()  # nm per voxel
    ct = client.materialize.query_table("aibs_metamodel_celltypes_v661")
    types = {int(r.pt_root_id): str(getattr(r, "cell_type", "neuron")) for r in ct.itertuples()}

    OUT.mkdir(parents=True, exist_ok=True)
    pos = {}
    with open(OUT / "neurons.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(["id", "type", "x", "y", "z"])
        for r in nuc.itertuples():
            rid = int(r.pt_root_id)
            p = r.pt_position  # in voxels
            x, y, z = float(p[0]) * vox[0], float(p[1]) * vox[1], float(p[2]) * vox[2]
            pos[rid] = (x, y, z)
            w.writerow([rid, types.get(rid, "neuron"), x, y, z])
    print(f"wrote {len(pos)} neurons")

    # 3) synapses among the kept set (aggregate contacts → weight)
    syn = client.materialize.synapse_query(pre_ids=list(keep), post_ids=list(keep))
    agg = {}
    for r in syn.itertuples():
        a, b = int(r.pre_pt_root_id), int(r.post_pt_root_id)
        if a in pos and b in pos and a != b:
            agg[(a, b)] = agg.get((a, b), 0) + 1
    with open(OUT / "synapses.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(["pre", "post", "kind", "weight"])
        for (a, b), c in agg.items():
            w.writerow([a, b, "chemical", c])
    print(f"wrote {len(agg)} synaptic connections")

    _export_web(pos, agg, types)


def _export_web(pos: dict, agg: dict, types: dict) -> None:
    ids = list(pos.keys())
    index = {rid: i for i, rid in enumerate(ids)}
    coords = [pos[r] for r in ids]
    # normalize positions to a compact box for the viewer
    import numpy as np
    a = np.array(coords, dtype=float)
    a -= a.mean(axis=0); a /= (a.std() + 1e-9)
    edges = [[index[x], index[y], float(c)] for (x, y), c in agg.items()]
    outdeg = [0] * len(ids)
    for e in edges:
        outdeg[e[0]] += 1
    data = {
        "name": f"MICrONS mouse · {len(ids):,}", "n_neurons": len(ids), "n_synapses": len(edges),
        "ids": [str(r) for r in ids], "types": [types.get(r, "neuron") for r in ids],
        "pos": [[round(float(v) * 60, 2) for v in row] for row in a],
        "outdeg": outdeg, "edges": edges,
    }
    WEB.parent.mkdir(parents=True, exist_ok=True)
    WEB.write_text(json.dumps(data, separators=(",", ":")))
    print(f"wrote {WEB}  ({len(ids)} neurons, {len(edges)} edges, {WEB.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
