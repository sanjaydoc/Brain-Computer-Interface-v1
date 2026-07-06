<div align="center">

# Brain-Computer-Interface v1

**A configurable, scalable platform that brings a connectome to life —
built to climb from a 302-neuron worm to the human brain (~86B neurons, ~10¹⁴ synapses).**

[![License: MIT](https://img.shields.io/badge/License-MIT-0d0d0f.svg)](LICENSE)
[![Python 3.11+](https://img.shields.io/badge/python-3.11+-2f6fed.svg)](https://www.python.org/)
[![Status: P0](https://img.shields.io/badge/build-P0%20spine-0e9f6e.svg)](docs/PROJECT_PLAN.md)
[![Docs](https://img.shields.io/badge/docs-project%20plan-635bff.svg)](docs/PROJECT_PLAN.md)

[Website](https://sanjaydoc.github.io/Brain-Computer-Interface-v1/) ·
[Project plan](docs/PROJECT_PLAN.md) ·
[Control plane](https://sanjaydoc.github.io/Brain-Computer-Interface-v1/app/)

</div>

---

## What this is

A brain-computer interface has four parts. This project builds all four as one
configurable system, and closes the loop **in simulation first** so real hardware and
wet-lab components can plug into the same interfaces later.

| Part | What it is | In this repo |
|------|------------|--------------|
| **1 · Molecular** | De-novo biomolecules that make neurons ultrasound-sensitive | [De-Novo-LLM](https://github.com/sanjaydoc/De-Novo-LLM) design service |
| **2 · Hardware** | Ultrasound scanner: **sonogenetics** (write) + **neural dust** (read) | signal I/O contracts + simulated adapters |
| **3 · Brain template** | A living digital twin of a connectome | pluggable source: worm / synthetic / MICrONS |
| **4 · Virtual environment** | Simulate the twin, drive it, visualize it live | sim engine + acoustic channel + 3D viz |

## Two foundational principles

- **Configurability** — every layer is a registry-backed interface; a `config.yaml`
  profile selects *which implementation* loads. Worm and human are the same program with
  different profiles.
- **Scalability contract** — Structure-of-Arrays + sparse connectivity + partition-native
  storage; **no module is worse than O(E)**. Proven at 1M neurons, designed for 86B.

See the full design in **[`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md)**.

## Quickstart

```bash
uv venv && uv pip install -e ".[dev]"

bci sources                              # list swappable connectome sources
bci load profiles/synthetic_small.yaml   # build a brain from a profile, print stats
pytest                                    # incl. the 1M-neuron scalability proof
```

## The scale ladder

| Rung | Neurons | Synapses | Data |
|------|--------:|---------:|------|
| C. elegans (worm) | 302 | ~7,000 | real & complete |
| MICrONS (mouse V1 mm³) | ~200,000 | ~500,000,000 | real EM |
| Mouse (mesoscale) | ~71,000,000 | ~10¹² | real (regional) |
| **Human (North Star)** | **~86,000,000,000** | **~10¹⁴** | statistical |

## Project layout

```
backend/bci/         Python core — registry, config, connectome model + sources
backend/tests/       tests, incl. the scalability contract
profiles/            config profiles (worm, synthetic, ...) — pick one to run
docs/                GitHub Pages site (index.html + app/) + PROJECT_PLAN.md
```

## Roadmap

- [x] **P0** — spine: config + registry, connectome SoA/sparse model, synthetic source, 1M-neuron proof
- [ ] **P1** — real C. elegans connectome loads + renders in the GUI (static 3D)
- [ ] **P2** — simulation engine (neurons fire), headless
- [ ] **P3** — live streaming → real-time 3D visualization
- [ ] **P4** — sonogenetic write + neural-dust read (stimulus in, activity out)
- [ ] **P5** — full GUI control-plane panels + polish

## License & credits

[MIT](LICENSE). GUI theme adapted from [LabSuite](https://github.com/sanjaydoc/LabSuite).
Connectome data: [OpenWorm](https://openworm.org/) (worm), [MICrONS](https://www.microns-explorer.org/) (mouse).
