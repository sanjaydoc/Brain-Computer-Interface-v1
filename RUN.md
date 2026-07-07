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

PowerShell often blocks venv activation scripts, so the simplest path is to **call the
venv's Python directly** (no activation, no policy change):

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev,api]"
.\.venv\Scripts\python.exe -m bci.cli serve
```

Then open **http://localhost:8000/app/**

> Prefer to activate the venv instead? Allow scripts for this terminal only, then activate:
> ```powershell
> Set-ExecutionPolicy -Scope Process -Bypass
> .\.venv\Scripts\Activate.ps1
> pip install -e ".[dev,api]"
> bci serve
> ```
> `-Scope Process` only affects the current window. After activating, you can use the short
> `bci ...` commands instead of `.\.venv\Scripts\python.exe -m bci.cli ...`.

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

## 5. Tests

```bash
# macOS / Linux or activated venv
pytest

# Windows, no activation
.\.venv\Scripts\python.exe -m pytest
```
22 tests: connectome loading, the emergent-locomotion behavior, I/O contracts, the live
API, the molecular pipeline, and scalability (proven to 1,000,000+ neurons).

---

## 6. Regenerate the README figures (optional)

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

## 7. Real biomolecule generation (De-Novo-LLM)

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

## 8. Troubleshooting

| Symptom | Fix |
|---------|-----|
| `running scripts is disabled on this system` (PowerShell) | Use `.\.venv\Scripts\python.exe -m ...` (no activation), or run `Set-ExecutionPolicy -Scope Process -Bypass` first. |
| `The token '&&' is not a valid statement separator` | Old PowerShell — run each command on its own line (don't chain with `&&`). |
| `bci` not found | Use `python -m bci.cli ...` (or `.\.venv\Scripts\python.exe -m bci.cli ...` on Windows). |
| Port 8000 in use | `bci serve --port 8080` |
| Biomolecules panel says "demo" | Real generation needs De-Novo-LLM installed (§7); the demo fallback still works. |
