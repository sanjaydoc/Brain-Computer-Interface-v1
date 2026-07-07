"""Fetch the real Allen Institute mouse **mesoscale** region graph into the cache (Rung 3).

The Allen Mouse Brain Connectivity Atlas (Oh et al., Nature 2014) publishes a region-by-region
connection-strength matrix over the summary structures. This script pulls it via the allensdk
and writes it in the atlas-cache format that `MesoscaleSource` reads:

    data/connectomes/mouse_mesoscale/regions.csv            id,name,x,y,z,volume
    data/connectomes/mouse_mesoscale/region_connectivity.csv pre,post,weight

Once cached, `bci load profiles/mouse.yaml` (and the control-plane "Mouse" option) build the
neuron-level connectome from the *real* region graph instead of the procedural scaffold —
nothing else changes.

Prerequisites (machine with internet):
    pip install allensdk
Then:
    python scripts/fetch_mouse_mesoscale.py
"""

from __future__ import annotations

import argparse
import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "connectomes" / "mouse_mesoscale"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", default=str(OUT / "mcc_manifest.json"),
                    help="allensdk cache manifest path")
    ap.add_argument("--threshold", type=float, default=0.0,
                    help="drop normalized connection strengths below this")
    args = ap.parse_args()

    try:
        from allensdk.core.mouse_connectivity_cache import MouseConnectivityCache
    except ImportError:
        raise SystemExit("Install allensdk first:  pip install allensdk")

    import numpy as np

    OUT.mkdir(parents=True, exist_ok=True)
    mcc = MouseConnectivityCache(manifest_file=args.manifest)
    st = mcc.get_structure_tree()

    # Summary structures = the coarse region set the mesoscale matrix is reported over.
    summary = st.get_structures_by_set_id([167587189])
    ids = [s["id"] for s in summary]
    by_id = {s["id"]: s for s in summary}
    print(f"summary structures: {len(ids)}")

    # 1) region centroids + volumes from the reference-space structure masks (25µm voxels → mm)
    centroid, volume = {}, {}
    for sid in ids:
        try:
            mask, _ = mcc.get_structure_mask(sid)
            zyx = np.argwhere(mask > 0)
            if len(zyx):
                c = zyx.mean(axis=0) * 0.025
                centroid[sid] = (float(c[2]), float(c[1]), float(c[0]))
                volume[sid] = float(len(zyx)) * (0.025 ** 3)
        except Exception as ex:
            print(f"  no mask for {sid}: {ex}")

    # 2) region→region strength: mean normalized projection volume from each source's injections
    conn = {}
    for sid in ids:
        try:
            exp_ids = [e["id"] for e in mcc.get_experiments(injection_structure_ids=[sid])]
            if not exp_ids:
                continue
            u = mcc.get_structure_unionizes(exp_ids, is_injection=False,
                                            structure_ids=ids, hemisphere_ids=[3])
            g = u.groupby("structure_id")["normalized_projection_volume"].mean()
            for tid, val in g.items():
                if val > args.threshold and tid in by_id and tid != sid:
                    conn[(sid, tid)] = float(val)
        except Exception as ex:
            print(f"  skip {sid}: {ex}")

    kept = [sid for sid in ids if sid in centroid]
    with open(OUT / "regions.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(["id", "name", "x", "y", "z", "volume"])
        for sid in kept:
            x, y, z = centroid[sid]
            w.writerow([sid, by_id[sid]["acronym"], x, y, z, volume.get(sid, 1.0)])
    rows = 0
    with open(OUT / "region_connectivity.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(["pre", "post", "weight"])
        for (a, b), val in conn.items():
            if a in centroid and b in centroid:
                w.writerow([a, b, val]); rows += 1
    print(f"wrote {len(kept)} regions, {rows} region-region connections to {OUT}")
    print("Now: bci load profiles/mouse.yaml  (builds the neuron-level connectome from real data)")


if __name__ == "__main__":
    main()
