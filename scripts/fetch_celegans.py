"""Fetch + normalize the real C. elegans connectome into vendored CSVs.

Sources (both authoritative, both real):
  * Connectivity — Cook et al. 2019 (the modern complete hermaphrodite connectome),
    via the `cect` package (bundled SI spreadsheet). 302 neurons.
  * 3D positions — OpenWorm c302 full model (`c302_C0_Full.net.nml`), real anatomical
    soma coordinates for every neuron.

Writes small, reproducible CSVs to data/connectomes/celegans/ which are committed to the
repo so `CElegansSource` loads offline with no `cect` dependency at runtime.

Run:  .venv/bin/python scripts/fetch_celegans.py   (needs: pip install cect)
"""

from __future__ import annotations

import csv
import urllib.request
import warnings
import xml.etree.ElementTree as ET
from pathlib import Path

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "connectomes" / "celegans"
RAW = OUT / "raw"
OUT.mkdir(parents=True, exist_ok=True)
RAW.mkdir(parents=True, exist_ok=True)

NML_URL = "https://raw.githubusercontent.com/openworm/c302/master/examples/c302_C0_Full.net.nml"
NML = RAW / "c302_C0_Full.net.nml"
NS = {"n": "http://www.neuroml.org/schema/neuroml2"}


def load_positions() -> dict[str, tuple[float, float, float]]:
    if not NML.exists():
        print(f"downloading positions: {NML_URL}")
        urllib.request.urlretrieve(NML_URL, NML)
    root = ET.parse(NML).getroot()
    pos: dict[str, tuple[float, float, float]] = {}
    for p in root.findall(".//n:population", NS):
        loc = p.find(".//n:location", NS)
        if loc is not None:
            pos[p.get("id")] = (float(loc.get("x")), float(loc.get("y")), float(loc.get("z")))
    print(f"positions: {len(pos)} cells")
    return pos


def load_types() -> dict[str, str]:
    """Neuron classification (e.g. 'Ring interneuron') from cect's cell-info table."""
    import cect
    info = Path(cect.__file__).parent / "data" / "all_cell_info.csv"
    types: dict[str, str] = {}
    with open(info) as f:
        for row in csv.DictReader(f):
            types[row["Cell name"]] = row.get("Classification") or row.get("Type") or "neuron"
    return types


def load_connectome():
    """Cook 2019 hermaphrodite: (nodes, connections)."""
    import importlib

    reader = importlib.import_module("cect.readers.Cook2019HermReader")
    nodes, conns = reader.get_instance().read_data()
    return nodes, conns


def main() -> None:
    pos = load_positions()
    types = load_types()
    nodes, conns = load_connectome()
    print(f"connectome: {len(nodes)} neurons, {len(conns)} connections")

    missing = [n for n in nodes if n not in pos]
    if missing:
        print(f"WARNING: {len(missing)} neurons without a position: {missing[:10]}")
    kept = [n for n in nodes if n in pos]

    # neurons.csv
    with open(OUT / "neurons.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "type", "x", "y", "z"])
        for n in kept:
            x, y, z = pos[n]
            w.writerow([n, types.get(n, "neuron"), x, y, z])

    # synapses.csv  (kind: chemical | electrical; weight = connection count)
    keep = set(kept)
    rows = 0
    with open(OUT / "synapses.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["pre", "post", "kind", "weight"])
        for c in conns:
            if c.pre_cell not in keep or c.post_cell not in keep:
                continue
            sc = (c.synclass or "").lower()
            kind = "electrical" if ("gj" in sc or "elec" in sc) else "chemical"
            w.writerow([c.pre_cell, c.post_cell, kind, c.number])
            rows += 1

    print(f"wrote {OUT/'neurons.csv'}  ({len(kept)} neurons)")
    print(f"wrote {OUT/'synapses.csv'} ({rows} synapses)")


if __name__ == "__main__":
    main()
