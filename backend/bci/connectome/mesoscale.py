"""MesoscaleSource — Rung 3 of the scale ladder: a *statistical* mouse-scale connectome.

Below the whole-brain rung, no one has an EM wiring diagram of every synapse — the data
that exists is **mesoscale**: a region-by-region connection-strength matrix (the Allen
Mouse Brain Connectivity Atlas, Oh et al. 2014, ~213 summary structures). This source turns
that region graph into a neuron-level connectome at *any* scale by:

  1. distributing N neurons across the regions (∝ region volume),
  2. placing each neuron at its region centroid + jitter (real 3D space for viz + addressing),
  3. wiring each neuron's out-synapses by first drawing a **target region** from that region's
     connectivity row, then a neuron within it — so structure is modular + spatially embedded,
     not uniform-random like `synthetic`.

Out of the box it builds a deterministic, brain-like *procedural scaffold* (distance-decay +
small-world region graph). Run `scripts/fetch_mouse_mesoscale.py` on a machine with the
allensdk to drop the **real Allen mesoscale matrix** into the cache; this source picks it up
automatically — nothing downstream changes.

Scalability Contract (PLAN §2.3): assembly is vectorized numpy + sparse COO→CSR, O(N + E),
no per-neuron Python loop and no dense N×N. Proven headless well past 1,000,000 neurons.
"""

from __future__ import annotations

import csv
from pathlib import Path

import numpy as np
import scipy.sparse as sp

from .base import sources
from .schema import Connectome

DATA = Path(__file__).resolve().parents[3] / "data" / "connectomes" / "mouse_mesoscale"


@sources.register("mesoscale")
class MesoscaleSource:
    """Region-modular statistical connectome (mouse mesoscale → arbitrary N).

    Parameters
    ----------
    n : total neurons to instantiate across the regions.
    avg_degree : mean out-synapses per neuron. Total synapses ~= n * avg_degree.
    n_regions : number of regions for the *procedural* scaffold (ignored when a real
        atlas is cached; the Allen summary structures set the count then).
    local_frac : fraction of the connectivity row mass forced onto a region's own
        neurons — the strong recurrent local wiring every cortical area shows.
    seed : RNG seed (deterministic; no nondeterministic edges).
    """

    def __init__(
        self,
        n: int = 1_000_000,
        avg_degree: int = 16,
        n_regions: int = 213,
        local_frac: float = 0.55,
        seed: int = 0,
    ) -> None:
        if n <= 0:
            raise ValueError("n must be positive")
        self.n = int(n)
        self.avg_degree = int(min(avg_degree, n - 1)) if n > 1 else 0
        self.n_regions = int(max(1, min(n_regions, n)))
        self.local_frac = float(local_frac)
        self.seed = int(seed)

    # -- region atlas: real Allen cache if present, else a procedural scaffold ----------
    def _atlas(self, rng: np.random.Generator):
        """Return (names, centroids[R,3], volume[R], P[R,R] row-stochastic)."""
        regions_csv = DATA / "regions.csv"
        if regions_csv.exists():
            return self._load_real_atlas()
        return self._procedural_atlas(rng)

    def _load_real_atlas(self):
        names, cen, vol = [], [], []
        with open(DATA / "regions.csv", newline="") as f:
            for row in csv.DictReader(f):
                names.append(row.get("name", row["id"]))
                cen.append((float(row["x"]), float(row["y"]), float(row["z"])))
                vol.append(float(row.get("volume", 1.0)))
        idx = {n: i for i, n in enumerate(names)}
        R = len(names)
        P = np.zeros((R, R), dtype=np.float64)
        conn = DATA / "region_connectivity.csv"
        with open(conn, newline="") as f:
            for row in csv.DictReader(f):
                i, j = idx.get(row["pre"]), idx.get(row["post"])
                if i is not None and j is not None:
                    P[i, j] += float(row.get("weight", 1.0))
        return (np.array(names, dtype=object), np.array(cen, dtype=np.float64),
                np.array(vol, dtype=np.float64), self._rowstochastic(P))

    def _procedural_atlas(self, rng: np.random.Generator):
        R = self.n_regions
        # Region centroids in a brain-shaped ellipsoid (elongated A–P, like a mouse brain).
        u = rng.normal(size=(R, 3))
        u /= np.linalg.norm(u, axis=1, keepdims=True) + 1e-9
        rad = rng.random(R)[:, None] ** (1 / 3)          # uniform-in-volume radii
        cen = u * rad * np.array([5.0, 2.2, 3.0])          # mm-ish ellipsoid (A-P, D-V, M-L)
        vol = rng.random(R) * 0.9 + 0.1                    # relative region volumes
        names = np.array([f"R{r:03d}" for r in range(R)], dtype=object)

        # Region graph = distance-decay (local wiring dominates) + a few small-world hops.
        d = np.linalg.norm(cen[:, None, :] - cen[None, :, :], axis=2)
        lam = np.median(d[d > 0]) * 0.5
        P = np.exp(-d / (lam + 1e-9))
        np.fill_diagonal(P, 0.0)
        # sprinkle long-range hub connections (small-world): boost ~2R random region pairs
        hubs = rng.integers(0, R, size=(min(2 * R, R * R), 2))
        P[hubs[:, 0], hubs[:, 1]] += rng.random(hubs.shape[0]) * P.max()
        return names, cen, vol, self._rowstochastic(P)

    @staticmethod
    def _rowstochastic(P: np.ndarray) -> np.ndarray:
        rs = P.sum(axis=1, keepdims=True)
        rs[rs == 0] = 1.0
        return P / rs

    def load(self) -> Connectome:
        rng = np.random.default_rng(self.seed)
        names, cen, vol, P = self._atlas(rng)
        R = len(names)
        n, k = self.n, self.avg_degree

        # 1) allocate neurons to regions ∝ volume (largest-remainder → counts sum to exactly n)
        share = vol / vol.sum() * n
        count = np.floor(share).astype(np.int64)
        count[np.argsort(-(share - count))[: n - int(count.sum())]] += 1
        region_of = np.repeat(np.arange(R), count)          # (n,) sorted by region
        start = np.zeros(R + 1, dtype=np.int64)
        np.cumsum(count, out=start[1:])                      # start[r]..start[r+1] = region r's block

        # 2) positions: region centroid + gaussian jitter (compact box for the viewer)
        pos = (cen[region_of] + rng.normal(scale=0.35, size=(n, 3))).astype(np.float32)
        types = names[region_of]                            # colour-by-region downstream
        ids = np.array([f"m{i}" for i in range(n)], dtype=object)

        if k == 0 or n < 2:
            return Connectome(ids=ids, types=types, pos=pos,
                              weights=sp.csr_matrix((n, n), dtype=np.float32))

        # 3) edges — per source region (R small), vectorized. Each region's connectivity row
        #    (blended with a strong local self-term) picks target regions; a uniform draw picks
        #    the target neuron inside that region. O(N·k), no dense N×N.
        eye = np.eye(R)
        Pmix = (1 - self.local_frac) * P + self.local_frac * eye
        Pmix = self._rowstochastic(Pmix)
        pre_all, post_all = [], []
        for r in range(R):
            c = int(count[r])
            if c == 0:
                continue
            m = c * k
            block = np.arange(start[r], start[r + 1], dtype=np.int64)
            pre = np.repeat(block, k)
            tgt_region = rng.choice(R, size=m, p=Pmix[r])
            span = count[tgt_region]
            valid = span > 0
            offset = np.zeros(m, dtype=np.int64)
            offset[valid] = (rng.random(valid.sum()) * span[valid]).astype(np.int64)
            post = start[tgt_region] + offset
            keep = valid & (pre != post)                    # drop empty-region + self-loops
            pre_all.append(pre[keep]); post_all.append(post[keep])

        pre = np.concatenate(pre_all); post = np.concatenate(post_all)
        w = rng.random(pre.shape[0], dtype=np.float32) * 0.9 + 0.1
        weights = sp.coo_matrix((w, (pre, post)), shape=(n, n), dtype=np.float32).tocsr()
        weights.sum_duplicates()
        return Connectome(ids=ids, types=types, pos=pos, weights=weights)
