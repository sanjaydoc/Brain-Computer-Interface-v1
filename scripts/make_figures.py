"""Generate the figures embedded in the README.

Produces, into docs/media/:
  * scalability_benchmark.png — real load-time measurements of SyntheticSource across
    N = 1e3 .. 1e7 neurons, showing the O(N+E) scaling promised by the contract.
  * connectome_preview.png     — a 3D scatter of a small synthetic connectome + edges.

Run:  .venv/bin/python scripts/make_figures.py
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from bci.connectome import sources  # noqa: E402

MEDIA = Path(__file__).resolve().parents[1] / "docs" / "media"
MEDIA.mkdir(parents=True, exist_ok=True)

# Theme colors (match docs/assets/theme.css)
INK = "#0d0d0f"
MOLECULAR = "#635bff"
SCANNER = "#d98218"
TEMPLATE = "#2f6fed"
VENV = "#0e9f6e"
HAIR = "#e7e7ea"

plt.rcParams.update(
    {
        "font.family": "DejaVu Sans",
        "axes.edgecolor": INK,
        "axes.labelcolor": INK,
        "text.color": INK,
        "xtick.color": INK,
        "ytick.color": INK,
        "figure.facecolor": "white",
        "axes.facecolor": "white",
        "savefig.facecolor": "white",
    }
)


def scalability_benchmark() -> None:
    sizes = [1_000, 10_000, 100_000, 1_000_000, 10_000_000]
    times, syn = [], []
    for n in sizes:
        t0 = time.perf_counter()
        c = sources.create("synthetic", n=n, avg_degree=10, seed=0).load()
        times.append(time.perf_counter() - t0)
        syn.append(c.n_synapses)
        print(f"  N={n:>10,}  {times[-1]*1000:8.1f} ms  {c.n_synapses:>12,} synapses")

    fig, ax = plt.subplots(figsize=(9, 5.2))
    ax.loglog(sizes, times, "-o", color=TEMPLATE, linewidth=2.4, markersize=8,
              markerfacecolor="white", markeredgecolor=TEMPLATE, markeredgewidth=2,
              label="measured load time")
    # ideal linear reference anchored at the first point
    ref = [times[0] * (n / sizes[0]) for n in sizes]
    ax.loglog(sizes, ref, "--", color="#9a9aa2", linewidth=1.6, label="ideal O(N) reference")

    for x, y in zip(sizes, times):
        ax.annotate(f"{y*1000:.0f} ms", (x, y), textcoords="offset points",
                    xytext=(0, 12), ha="center", fontsize=9, color=INK)

    ax.set_xlabel("neurons (log scale)", fontsize=12)
    ax.set_ylabel("connectome build time, seconds (log scale)", fontsize=12)
    ax.set_title("Scalability contract, proven: build time stays near-linear — no O(N²) blowup",
                 fontsize=12.5, fontweight="bold", pad=14)
    ax.grid(True, which="both", color=HAIR, linewidth=0.8)
    ax.legend(frameon=False, fontsize=11, loc="upper left")
    ax.set_axisbelow(True)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    fig.tight_layout()
    fig.savefig(MEDIA / "scalability_benchmark.png", dpi=150)
    plt.close(fig)
    print("wrote scalability_benchmark.png")


def connectome_preview() -> None:
    c = sources.create("synthetic", n=300, avg_degree=6, seed=7).load()
    pos = c.pos
    coo = c.weights.tocoo()

    fig = plt.figure(figsize=(8.4, 7.2))
    ax = fig.add_subplot(111, projection="3d")

    # a subset of edges as faint lines
    rng = np.random.default_rng(0)
    idx = rng.choice(coo.nnz, size=min(500, coo.nnz), replace=False)
    for e in idx:
        i, j = coo.row[e], coo.col[e]
        ax.plot([pos[i, 0], pos[j, 0]], [pos[i, 1], pos[j, 1]], [pos[i, 2], pos[j, 2]],
                color=HAIR, linewidth=0.5, alpha=0.7)

    # neurons colored by out-degree (a proxy for "hub-ness")
    outdeg = np.asarray(c.weights.getnnz(axis=1)).ravel()
    p = ax.scatter(pos[:, 0], pos[:, 1], pos[:, 2], c=outdeg, cmap="viridis",
                   s=42, edgecolors=INK, linewidths=0.4, depthshade=True)
    cb = fig.colorbar(p, ax=ax, shrink=0.6, pad=0.02)
    cb.set_label("out-degree (synapses out)", fontsize=10)

    ax.set_title("Brain template preview — a 300-neuron connectome as a living twin\n"
                 "(nodes = neurons in 3D space, lines = synapses)", fontsize=12,
                 fontweight="bold", pad=10)
    ax.set_xticks([]); ax.set_yticks([]); ax.set_zticks([])
    ax.grid(False)
    fig.tight_layout()
    fig.savefig(MEDIA / "connectome_preview.png", dpi=150)
    plt.close(fig)
    print("wrote connectome_preview.png")


if __name__ == "__main__":
    print("scalability benchmark:")
    scalability_benchmark()
    connectome_preview()
