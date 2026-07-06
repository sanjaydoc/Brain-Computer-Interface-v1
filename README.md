# Brain-Computer-Interface v1

A scalable connectome simulation and live-visualization platform, built to climb from a
302-neuron worm to the **human brain (~86B neurons, ~10¹⁴ synapses)** without a rewrite.

Four parts, one loop:

1. **Molecular** — de-novo biomolecule design ([De-Novo-LLM](https://github.com/sanjaydoc/De-Novo-LLM)) for sonogenetic ion channels.
2. **Hardware** — **neural dust** (read) + **sonogenetics** (write), ultrasound scanner.
3. **Brain Template** — a living digital twin of a connectome (pluggable: worm / synthetic / MICrONS).
4. **Virtual environment** — simulate the twin, drive it, and watch it live.

Two foundational principles bind every module: **configurability** (config selects
implementations) and a **scalability contract** (SoA + sparse + partition-native, nothing
worse than O(E)). See [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md).

## Status

Phased build. **P0 (spine) in progress** — config + registry, connectome data model, a
synthetic source proven to 1M neurons.

## Quickstart

```bash
uv venv && uv pip install -e ".[dev]"
.venv/bin/bci sources
.venv/bin/bci load profiles/synthetic_small.yaml
.venv/bin/pytest
```
