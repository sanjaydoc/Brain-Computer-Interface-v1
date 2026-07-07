"""Fetch + normalize the MICrONS mouse cortical column (Rung 2) into the CSV cache.

Prerequisites (on a machine with internet):
    pip install caveclient
    # one-time free CAVE token — initialize the GLOBAL client first, then save the token:
    #   python
    #   >>> from caveclient import CAVEclient
    #   >>> c = CAVEclient(server_address="https://global.daf-apis.com")
    #   >>> c.auth.get_new_token()          # opens a URL; log in, copy the token
    #   >>> c.auth.save_token(token="...")
    # then accept the MICrONS public Terms of Service once (in a browser, logged in):
    #   https://global.daf-apis.com/sticky_auth/api/v1/tos/2/accept

Then:
    python scripts/fetch_microns.py --max-neurons 20000

Table names are discovered at runtime (MICrONS renames them across materialization
versions), so this keeps working as the public release advances.

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


def _pick_table(client, *cands):
    """Return the first candidate table that exists, else the first fuzzy keyword match.
    MICrONS renames tables across materialization versions, so we discover instead of hardcode."""
    tables = set(client.materialize.get_tables())
    for c in cands:
        if c in tables:
            return c
    key = cands[0].split("_")[0]
    for t in sorted(tables):
        if key in t:
            print(f"  (using '{t}' for '{cands[0]}')")
            return t
    raise SystemExit(f"none of {cands} found. Available tables:\n  " + "\n  ".join(sorted(tables)))


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

    # 1) proofread neurons — prefer ones with a complete (extended/clean) axon so their
    #    outgoing connectivity is real. Table renamed across releases → discover it.
    pr_table = _pick_table(client, "proofreading_status_and_strategy", "proofreading_status_public_release")
    pr = client.materialize.query_table(pr_table)
    if "status_axon" in pr.columns:
        good = pr[pr["status_axon"].astype(str).str.lower().isin(["extended", "clean", "t", "true"])]
        if len(good) > 100:
            pr = good
    id_col = "pt_root_id" if "pt_root_id" in pr.columns else "valid_id"
    root_ids = [int(r) for r in pr[id_col].dropna().unique() if int(r) != 0][: args.max_neurons]
    keep = set(root_ids)
    print(f"proofread neurons in {pr_table}: {len(pr)} → keeping {len(keep)}")

    # 2) soma positions + cell types (voxel coords are fine; we normalize for the viewer)
    nuc = client.materialize.query_table(_pick_table(client, "nucleus_detection_v0", "nucleus_detection"))
    nuc = nuc[nuc["pt_root_id"].isin(keep)]
    ct = client.materialize.query_table(_pick_table(client, "aibs_metamodel_celltypes_v661", "aibs_metamodel_celltypes"))
    types = {int(r.pt_root_id): str(getattr(r, "cell_type", "neuron"))
             for r in ct.itertuples() if getattr(r, "pt_root_id", None) is not None}

    OUT.mkdir(parents=True, exist_ok=True)
    pos = {}
    with open(OUT / "neurons.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(["id", "type", "x", "y", "z"])
        for r in nuc.itertuples():
            rid = int(r.pt_root_id)
            p = r.pt_position  # voxel coords — relative positions are all the viewer needs
            pos[rid] = (float(p[0]), float(p[1]), float(p[2]))
            w.writerow([rid, types.get(rid, "neuron"), *pos[rid]])
    print(f"wrote {len(pos)} neurons")

    # 3) synapses among the kept set. Querying pre_ids AND post_ids together builds a giant
    #    double-IN SQL clause that crashes the server, so query outgoing synapses in small
    #    presynaptic batches and filter the postsynaptic side to the kept set locally.
    import time

    kept_ids = [rid for rid in keep if rid in pos]
    agg = {}
    BATCH = 50
    for start in range(0, len(kept_ids), BATCH):
        batch = kept_ids[start:start + BATCH]
        syn = None
        for attempt in range(4):
            try:
                syn = client.materialize.synapse_query(pre_ids=batch)
                break
            except Exception as ex:
                if attempt == 3:
                    print(f"  batch @{start} failed, skipping: {str(ex)[:80]}")
                else:
                    time.sleep(2 * (attempt + 1))
        if syn is None:
            continue
        for r in syn.itertuples():
            a, b = int(r.pre_pt_root_id), int(r.post_pt_root_id)
            if a in pos and b in pos and a != b:
                agg[(a, b)] = agg.get((a, b), 0) + 1
        print(f"  synapses: {min(start + BATCH, len(kept_ids))}/{len(kept_ids)} neurons scanned, {len(agg):,} connections")

    with open(OUT / "synapses.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(["pre", "post", "kind", "weight"])
        for (a, b), c in agg.items():
            w.writerow([a, b, "chemical", c])
    print(f"wrote {len(agg):,} synaptic connections")

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
