<div align="center">

# 🧠 Brain-Computer-Interface v1

### Bring a connectome to life — from a 302-neuron worm to the human brain.

**A configurable, scalable platform that designs the molecules, drives an ultrasound
read/write scanner, holds a living digital-twin of a brain, and runs it in a virtual
environment with live 3D visualization.**

[![License: MIT](https://img.shields.io/badge/License-MIT-0d0d0f.svg)](LICENSE)
[![Python 3.11+](https://img.shields.io/badge/python-3.11+-2f6fed.svg)](https://www.python.org/)
[![Build: P1 worm](https://img.shields.io/badge/build-P1%20worm%20✓-0e9f6e.svg)](docs/PROJECT_PLAN.md)
[![Scale](https://img.shields.io/badge/proven-10M%20neurons-635bff.svg)](#-scalability-proven-not-promised)
[![North Star](https://img.shields.io/badge/target-86B%20neurons-d98218.svg)](#-the-scale-ladder)

[**🌐 Website**](https://sanjaydoc.github.io/Brain-Computer-Interface-v1/) ·
[**📖 Project Plan**](docs/PROJECT_PLAN.md) ·
[**🎛️ Control Plane**](https://sanjaydoc.github.io/Brain-Computer-Interface-v1/app/)

_Author: **Dr. Sanjay Anbu**_

</div>

---

## 📑 Table of contents

- [What this is](#-what-this-is)
- [The four parts, one loop](#-the-four-parts-one-loop)
- [System architecture](#-system-architecture)
- [Two foundational principles](#-two-foundational-principles)
- [Scalability, proven not promised](#-scalability-proven-not-promised)
- [The brain template](#-the-brain-template)
- [The scale ladder](#-the-scale-ladder)
- [The GUI control plane](#-the-gui-control-plane)
- [Quickstart](#-quickstart)
- [Project layout](#-project-layout)
- [Roadmap](#-roadmap)
- [Data sources & credits](#-data-sources--credits)

---

## 🔭 What this is

A brain-computer interface has **four parts**. This project builds all four as one
configurable system and **closes the loop in simulation first**, so that real hardware
and wet-lab components can plug into the *same interfaces* later — no rewrite.

| Part | Real-world layer | What it does | In this repo |
|:----:|------------------|--------------|--------------|
| **1 · Molecular** | Biomolecules | De-novo design of ion channels that make neurons ultrasound-sensitive | [De-Novo-LLM](https://github.com/sanjaydoc/De-Novo-LLM) design service |
| **2 · Hardware** | Ultrasound scanner | **Sonogenetics** to *write*, **neural dust** to *read* | signal I/O contracts + simulated adapters |
| **3 · Template** | The connectome | A living digital twin of a nervous system | pluggable source: worm / synthetic / MICrONS |
| **4 · Virtual env** | Simulation | Run the twin, drive it, and watch it live | sim engine + acoustic channel + 3D viz |

---

## 🔁 The four parts, one loop

The four parts aren't separate — they form a **single closed loop**. Molecules make
neurons ultrasound-sensitive; the scanner writes with focused ultrasound and reads with
neural dust; the template says which neurons carry the machinery; the virtual environment
runs the whole thing and shows it live.

```mermaid
flowchart LR
    P1["🧬 <b>P1 Molecular</b><br/>De-Novo-LLM designs<br/>sonogenetic channels"]
    P2W["🔊 <b>P2 Write</b><br/>Sonogenetics<br/>(focused ultrasound)"]
    P3["🕸️ <b>P3 Brain Template</b><br/>living digital twin<br/>(which neurons respond)"]
    P4["🌐 <b>P4 Virtual Env</b><br/>simulate + visualize live"]
    P2R["📡 <b>P2 Read</b><br/>Neural dust<br/>(ultrasonic backscatter)"]

    P1 -->|"makes neurons<br/>sono-sensitive"| P3
    P4 -->|"stimulus"| P2W
    P2W -->|"opens channels"| P3
    P3 -->|"neurons fire"| P4
    P3 -->|"activity"| P2R
    P2R -->|"readout"| P4

    classDef mol fill:#efeeff,stroke:#635bff,color:#0d0d0f;
    classDef scan fill:#fbf1e4,stroke:#d98218,color:#0d0d0f;
    classDef tmpl fill:#e9f0fd,stroke:#2f6fed,color:#0d0d0f;
    classDef venv fill:#e6f5ee,stroke:#0e9f6e,color:#0d0d0f;
    class P1 mol; class P2W,P2R scan; class P3 tmpl; class P4 venv;
```

> **Why simulation first?** Wet-lab molecules and physical ultrasound hardware can't be
> *coded*. But they can be represented as **strict I/O contracts** (`NeuralInput` /
> `NeuralOutput`). v1 ships simulated adapters; real devices implement the same contracts
> later. The loop is real in software before it's real in silicon.

---

## 🏛️ System architecture

Everything is a **registry-backed interface** selected by config. The backend runs the
brain; a thin GUI drives it. Nothing worm-specific leaks into the foundation.

```mermaid
flowchart TB
    subgraph GUI["🎛️ GUI control plane (LabSuite-themed, zero-build)"]
        V["3D live view (Three.js)"]
        PAN["panels: biomolecules · scanner · template · virtual-env · system"]
    end

    subgraph BE["⚙️ Backend (Python)"]
        CFG["config.yaml → registry<br/>(selects every implementation)"]
        subgraph CORE["core loop (one authoritative stepper)"]
            direction LR
            READ["NeuralInput<br/>(neural dust)"] --> STEP["Stepper<br/>sparse matvec"]
            STEP --> WRITE["NeuralOutput<br/>(sonogenetics)"]
            STEP --> TWIN["Brain Template<br/>SoA + CSR (the twin)"]
        end
        SRC["ConnectomeSource<br/>worm · synthetic · MICrONS"]
        STREAM["Publisher<br/>view-scoped, binary, delta"]
    end

    SRC --> TWIN
    CFG -.selects.-> SRC & STEP & READ & WRITE & STREAM
    TWIN --> STREAM --> V
    PAN -.REST.-> CFG

    classDef g fill:#fafafa,stroke:#111114,color:#0d0d0f;
    class GUI,BE,CORE g;
```

---

## 🧱 Two foundational principles

Every module in the codebase obeys **two binding rules**. They are what make the climb
from 302 neurons to 86 billion a matter of *compute and config*, not rewrites.

### 1. Configurability — config selects *implementations*, not just values

```yaml
# profiles/synthetic_small.yaml
connectome:
  impl: synthetic          # ← swap for "celegans" or "microns"; nothing else changes
  params: { n: 1000, avg_degree: 10, seed: 0 }
```

Each layer (`ConnectomeSource`, `NeuronModel`, `Stepper`, `Renderer`, …) is a registry.
Adding a variant is **one class + one `@register` line** — never an edit to the core.

### 2. The Scalability Contract — nothing worse than O(E)

| Rule | Forbids |
|------|---------|
| **No per-element objects** — state is columnar arrays (SoA) | `class Neuron` in a list (dies ~1M) |
| **Sparse, never dense** — connectivity is CSR/COO | an 86B×86B matrix |
| **Linear or better** — ≤ O(N) neurons, O(E) synapses; **zero O(N²)** | all-pairs loops |
| **Bounded memory / out-of-core** — chunk / mmap / stream | materializing 500M synapses per frame |
| **Partition-native** — twin split into spatial chunks | a monolith that can't be distributed |

Full design → **[`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md)**.

---

## 📈 Scalability, proven not promised

A module isn't allowed to *call* itself scalable until it's benchmarked at millions of
neurons. Here is the **actual measured** build time of `SyntheticSource`, from 1,000 to
**10,000,000 neurons (100M synapses)** — staying near-linear, exactly as the contract
requires:

<div align="center">

![Scalability benchmark](docs/media/scalability_benchmark.png)

</div>

| Neurons | Synapses | Build time |
|--------:|---------:|-----------:|
| 1,000 | ~10,000 | ~1 ms |
| 100,000 | ~1,000,000 | ~100 ms |
| 1,000,000 | ~10,000,000 | ~3.7 s |
| **10,000,000** | **~100,000,000** | **~10 s** |

> Reproduce it yourself: `.venv/bin/python scripts/make_figures.py`

---

## 🕸️ The brain template

The **Brain Template** is a *living digital twin* — the connectome plus its live per-neuron
state, held as Structure-of-Arrays + a sparse synapse matrix. Below is a real 300-neuron
synthetic connectome rendered from the actual data model (nodes = neurons in 3D space,
lines = synapses, color = out-degree):

<div align="center">

![Connectome preview](docs/media/connectome_preview.png)

</div>

The same object scales: it's addressed by 3D coordinate (for the ultrasound scanner),
snapshot-able (save / load / rewind), and partition-native (splittable across machines).

---

## 🪜 The scale ladder

One code path, four rungs. Scaling up is **loading the next profile**, not a rewrite.

| Rung | Source | Neurons | Synapses | Data status |
|:----:|--------|--------:|---------:|-------------|
| 1 | **C. elegans** (worm) | 302 | ~7,000 | ✅ real & *complete* |
| 2 | **MICrONS** (mouse V1 mm³) | ~200,000 | ~500,000,000 | ✅ real EM |
| 3 | **Mouse** (mesoscale) | ~71,000,000 | ~10¹² | ✅ real (regional) |
| 4 | **🎯 Human** (North Star) | **~86,000,000,000** | **~10¹⁴** | statistical |

---

## 🎛️ The GUI control plane

A single web cockpit — **templated on [LabSuite](https://github.com/sanjaydoc/LabSuite)**
(zero-build, live + demo mode) — to run and manage all four parts. **The real 302-neuron
worm, rendered live in the browser** (orbit, auto-rotate, click-to-inspect; neurons colored
by out-degree, synapses as lines):

<div align="center">

![Control plane — the worm in 3D](docs/media/worm_viewer.png)

</div>

Try it live: **[control plane →](https://sanjaydoc.github.io/Brain-Computer-Interface-v1/app/)**
Panels: **Biomolecules** · **Scanner** · **Brain Template** · **Virtual Env** · **Live 3D** · **System**.

---

## 🚀 Quickstart

```bash
# 1. set up (uv recommended)
uv venv && uv pip install -e ".[dev]"

# 2. list the swappable connectome sources
bci sources
#   connectome sources: synthetic

# 3. build a brain from a profile and print stats
bci load profiles/synthetic_small.yaml
#   Connectome: 1,000 neurons, 9,953 synapses (~10.0 syn/neuron)  loaded in 5.7 ms

# 4. run the tests — including the scalability proof at 1,000,000 neurons
pytest

# 5. regenerate the figures in this README from live measurements
.venv/bin/python scripts/make_figures.py
```

---

## 🗂️ Project layout

```
Brain-Computer-Interface-v1/
├── backend/
│   ├── bci/
│   │   ├── registry.py        # the configurability spine — swappable seams
│   │   ├── config.py          # typed, validated profiles (Pydantic)
│   │   └── connectome/        # Brain Template: SoA + CSR model, sources
│   │       ├── schema.py      #   Connectome (arrays + sparse matrix)
│   │       ├── base.py        #   ConnectomeSource interface + registry
│   │       └── synthetic.py   #   SyntheticSource (vectorized, scalable)
│   └── tests/                 # correctness + the 1M-neuron scalability test
├── profiles/                  # config profiles — pick one to run
├── scripts/make_figures.py    # regenerate the README graphs from live data
├── docs/
│   ├── PROJECT_PLAN.md        # the complete architecture & design
│   ├── index.html + app/      # GitHub Pages site (LabSuite theme)
│   └── media/                 # generated figures + screenshots
└── .github/workflows/         # CI: auto-deploy Pages
```

---

## 🧭 Roadmap

- [x] **P0 — Spine** · config + registry, connectome SoA/sparse model, synthetic source, **10M-neuron proof**
- [x] **P1 — Worm** · real *C. elegans* connectome (Cook 2019 + OpenWorm) loads + **renders in 3D** in the browser
- [ ] **P2 — Simulation** · neurons actually fire (LIF), headless engine
- [ ] **P3 — Live** · real-time streaming → 3D visualization *(the headline)*
- [ ] **P4 — Loop** · sonogenetic write + neural-dust read (stimulus in, activity out)
- [ ] **P5 — Cockpit** · full GUI control-plane panels + polish

---

## 📚 Data sources & credits

- **Connectome data** — [OpenWorm](https://openworm.org/) (*C. elegans*, 302 neurons with 3D positions) · [MICrONS](https://www.microns-explorer.org/) (mouse visual cortex).
- **Molecular engine** — [De-Novo-LLM](https://github.com/sanjaydoc/De-Novo-LLM).
- **GUI theme** — adapted from [LabSuite](https://github.com/sanjaydoc/LabSuite).

**Author:** Dr. Sanjay Anbu · **License:** [MIT](LICENSE)

<div align="center"><sub>Built to climb from a worm to the human brain — one scalable module at a time.</sub></div>
