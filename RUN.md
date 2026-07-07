# Running Brain-Computer-Interface v1

Full command reference for Windows (PowerShell), macOS, and Linux.

---

## 1. Prerequisites

- **Python 3.11+** and **git**.
- (Optional) an **NVIDIA GPU + CUDA** and a trained [De-Novo-LLM](https://github.com/sanjaydoc/De-Novo-LLM)
  checkout for *real* biomolecule generation. Without it, the Biomolecules panel uses
  bundled samples.
- (Optional) an **NVIDIA API key** (https://build.nvidia.com) for NVIDIA NIM / BioNeMo cloud generation.

Check Python:
```bash
python --version      # Windows / some setups
python3 --version     # macOS / Linux
```

---

## 2. Get the code

```bash
git clone https://github.com/sanjaydoc/Brain-Computer-Interface-v1.git
cd Brain-Computer-Interface-v1
```

---

## 3. Set up + run

### Windows (PowerShell)

PowerShell blocks venv activation scripts by default. Allow them for this window only
(note the exact syntax — `Bypass` is the *value* of `-ExecutionPolicy`), then activate:

```powershell
python -m venv .venv
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev,api]"
bci serve
```

Your prompt shows `(.venv)` once activated. `-Scope Process` only affects the current
window and resets when you close it. Then open **http://localhost:8000/app/**

> **Don't want to activate?** Skip the two policy/activation lines and call the venv's
> Python directly — this always works, no policy change:
> ```powershell
> python -m venv .venv
> .\.venv\Scripts\python.exe -m pip install -e ".[dev,api]"
> .\.venv\Scripts\python.exe -m bci.cli serve
> ```

> **Command Prompt (cmd) instead of PowerShell?** No policy issue there:
> ```cmd
> python -m venv .venv
> .venv\Scripts\activate.bat
> pip install -e ".[dev,api]"
> bci serve
> ```

### macOS / Linux

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev,api]"
bci serve
```

Then open **http://localhost:8000/app/**

---

## 4. All CLI commands

After install. On Windows without activation, prefix each with
`.\.venv\Scripts\python.exe -m bci.cli` instead of `bci`.

| Command | What it does |
|---------|--------------|
| `bci serve` | Serve the GUI **and** the REST + WebSocket API (http://localhost:8000/app/) |
| `bci sources` | List the registered connectome sources |
| `bci load profiles/worm.yaml` | Load the real 302-neuron *C. elegans* connectome and print stats |
| `bci load profiles/synthetic_small.yaml` | Build a small synthetic brain and print stats |
| `bci run` | Run the full four-part loop headless — watch locomotion emerge from the connectome |
| `bci run --connectome synthetic --steps 400` | Run on a different source / length |

```bash
# examples (macOS / Linux or an activated venv)
bci serve
bci load profiles/worm.yaml
bci run
```

```powershell
# examples (Windows, no activation)
.\.venv\Scripts\python.exe -m bci.cli serve
.\.venv\Scripts\python.exe -m bci.cli load profiles/worm.yaml
.\.venv\Scripts\python.exe -m bci.cli run
```

Serve on a different host/port:
```bash
bci serve --host 0.0.0.0 --port 8080
```

---

## 5. Load a real large brain — the scale ladder (MICrONS / Drosophila)

The North Star is the human brain (86 B neurons / ~100 T synapses). We climb toward it one
real connectome at a time — every rung uses the **same** engine, renderer, and I/O contracts:

| Rung | Connectome | Neurons | Status | How to load |
|------|-----------|---------|--------|-------------|
| 1 | *C. elegans* (worm) | 302 | ✅ bundled | `bci load profiles/worm.yaml` — default, no download |
| 2a | MICrONS mouse visual cortex | ~200 k | ✅ fetch locally | `python scripts/fetch_microns.py` |
| 2b | *Drosophila* (FlyWire) | ~130 k | ✅ fetch locally | `python scripts/fetch_drosophila.py` |
| 3 | Mouse mesoscale (region-modular, statistical) | 1e5 … 71 M | ✅ works now | `bci load profiles/mouse.yaml` (real data: `python scripts/fetch_mouse_mesoscale.py`) |
| ★ | Human | 86 B | 🎯 North Star | — |

The worm is bundled; the big brains are **fetched on your own machine** (their data hosts —
CAVE and FlyWire — aren't reachable from the hosted demo). Once fetched, they appear in the
control-plane dropdown next to the brain-template tab and render with automatic level-of-detail
(GPU point cloud + sampled synapses above 8 k neurons).

### 2a — MICrONS mouse cortex
```bash
# macOS / Linux (needs internet + a free CAVE token)
pip install caveclient
python -c "from caveclient import CAVEclient; CAVEclient('minnie65_public').auth.setup_token(make_new=True)"
python scripts/fetch_microns.py --max-neurons 20000
```
```powershell
# Windows
.\.venv\Scripts\python.exe -m pip install caveclient
.\.venv\Scripts\python.exe -c "from caveclient import CAVEclient; CAVEclient('minnie65_public').auth.setup_token(make_new=True)"
.\.venv\Scripts\python.exe scripts/fetch_microns.py --max-neurons 20000
```

### 2b — Drosophila (FlyWire Codex)
Download the neurons + connections CSVs from <https://codex.flywire.ai/> → **Downloads**, then:
```bash
python scripts/fetch_drosophila.py --neurons neurons.csv --connections connections.csv --max-neurons 20000
```

Each script writes a CSV cache under `data/connectomes/<name>/` (used by the Python engine)
and a compact `docs/app/data/<name>.json` (used by the browser). `--max-neurons` controls the
downsample; the headless engine scales to millions, the browser is happiest under ~50 k.
Re-run `bci serve`, then pick the brain from the dropdown.

### 3 — Mouse mesoscale (scales to millions — no download needed)
Rung 3 is *statistical*: it turns the Allen mesoscale **region graph** into a neuron-level
connectome at any scale, so it runs **out of the box** with a brain-like procedural scaffold.
Set the scale with `n` in `profiles/mouse.yaml` (default 100 k; the engine is proven to 1 M).
```bash
bci load profiles/mouse.yaml          # build + print stats (region-modular wiring)
bci run --connectome mesoscale        # run the loop on it headless
```
To wire it from the **real Allen matrix** instead of the scaffold (region centroids +
connection strengths from Oh et al. 2014):
```bash
pip install allensdk
python scripts/fetch_mouse_mesoscale.py   # caches data/connectomes/mouse_mesoscale/*
bci load profiles/mouse.yaml              # now built from real region data
```
The control-plane dropdown ships a 6 k-neuron mesoscale preview so you can see the
region-modular structure in 3D without any setup.

---

## 6. Tests

```bash
# macOS / Linux or activated venv
pytest

# Windows, no activation
.\.venv\Scripts\python.exe -m pytest
```
33 tests: connectome loading, the Rung-2 sources (MICrONS / Drosophila), the Rung-3 mesoscale
source (region-modular structure + scale), the emergent-locomotion behavior, I/O contracts, the
live API, the molecular pipeline, and scalability (proven to 1,000,000+ neurons).

---

## 7. Regenerate the README figures (optional)

```bash
pip install -e ".[figures]"
python scripts/make_figures.py         # macOS / Linux
```
```powershell
.\.venv\Scripts\python.exe -m pip install -e ".[figures]"
.\.venv\Scripts\python.exe scripts/make_figures.py
```

Refresh the vendored worm data (needs the `cect` package):
```bash
pip install cect
python scripts/fetch_celegans.py
```

---

## 8. Real biomolecule generation (De-Novo-LLM)

The hosted web demo uses bundled samples (a browser can't run PyTorch). On your own machine,
install your trained [De-Novo-LLM](https://github.com/sanjaydoc/De-Novo-LLM) so the
**Biomolecules** panel flips from *"demo · bundled samples"* to *"live"*:

```bash
# macOS / Linux
pip install -e /path/to/De-Novo-LLM
export NVIDIA_API_KEY=nvapi-...          # optional: NVIDIA NIM / BioNeMo cloud
bci serve
```
```powershell
# Windows
.\.venv\Scripts\python.exe -m pip install -e "C:\path\to\De-Novo-LLM"
$env:NVIDIA_API_KEY = "nvapi-..."         # optional: NVIDIA NIM
.\.venv\Scripts\python.exe -m bci.cli serve
```

Generation backends are chosen automatically: **local GPU → NVIDIA NIM → bundled fallback**.

---

## 9. Troubleshooting

| Symptom | Fix |
|---------|-----|
| `running scripts is disabled on this system` (PowerShell) | Run `Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process` first, then `.\.venv\Scripts\Activate.ps1`. Or skip activation entirely: `.\.venv\Scripts\python.exe -m ...`. |
| `A parameter cannot be found that matches parameter name 'Bypass'` | Wrong order — it's `Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process` (`Bypass` is the value, not a flag). |
| `The token '&&' is not a valid statement separator` | Old PowerShell — run each command on its own line (don't chain with `&&`). |
| `bci` not found | Use `python -m bci.cli ...` (or `.\.venv\Scripts\python.exe -m bci.cli ...` on Windows). |
| Port 8000 in use | `bci serve --port 8080` |
| Biomolecules panel says "demo" | Real generation needs De-Novo-LLM installed (§8); the demo fallback still works. |
