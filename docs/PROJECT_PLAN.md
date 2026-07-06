# Brain-Computer-Interface v1 — Project Plan

> Status: **DRAFT — iterating** · No code written yet · Branch: `claude/new-project-planning-bk2g71`

### North Star
**Ultimate goal = the human brain (~86B neurons, ~10¹⁴ synapses).** Every architecture
decision is judged by whether it survives the climb worm → mouse → human. Nothing
worm-specific is allowed into the foundation.

### Locked decisions
- ✅ **Frontend:** Web — React + TypeScript + Three.js (react-three-fiber).
- ✅ **Connectome:** **Pluggable loader** — C. elegans (302), synthetic, MICrONS mouse
  behind one `ConnectomeSource`; multi-scale LOD ladder toward human.
- ✅ **Neuron model:** Start with **LIF**; **Hodgkin–Huxley** as a drop-in upgrade
  behind a shared `NeuronModel` interface.
- ✅ **Environment:** `stimulus_protocol` (universal sensory-in / activity-out) is the
  default; `worm_body` (OpenWorm-style) is an optional worm-only add-on.
- ✅ **Foundations:** configurability (§2.2) + scalability contract (§2.3) bind every module.
- ⏳ **Commit of this plan:** deferred — still iterating.

---

## 1. The Vision (as defined by the project owner)

A BCI has four major subsystems:

| # | Subsystem | Real-world layer | What it does |
|---|-----------|------------------|--------------|
| 1 | **Molecular engineering** | Biomolecules | Interface directly with individual neurons (read/write) |
| 2 | **Electronics & hardware** | Ultrasound scanner | Physically transmit / receive information to/from the brain |
| 3 | **ML research** | **Brain Template** | Holds the *connectome* — the wiring map of the nervous system |
| 4 | **Virtual environment** | **Simulation** | Simulates the connectome so it can be observed and driven |

**v1 headline deliverable: live, real-time visualization.**

---

## 2. Guiding principle for v1

Subsystems **1 (molecular)** and **2 (ultrasound hardware)** are wet-lab / physical
engineering — they cannot be *built in code*. But they **can** be represented in
software as **strict interface contracts**: typed data streams for "signals coming
IN from a neuron" and "signals going OUT to a neuron." If we design those contracts
now, real molecular/hardware devices can be plugged in later **without rewriting the
core**.

Subsystems **3 (connectome template)** and **4 (virtual environment)** are pure
software and are exactly where a live-visualization v1 lives.

> **Anchor decision:** v1 supports a **pluggable connectome source**. Two loaders ship
> in v1 behind one `ConnectomeSource` interface:
> - **`CElegansSource`** — the **C. elegans connectome (302 neurons)**, the only
>   *complete, real, cell-resolution* nervous system ever mapped (OpenWorm). Gives us
>   real biological ground truth to validate against.
> - **`SyntheticSource`** — a configurable generated network (N neurons, wiring rules,
>   seeded) for stress-testing, teaching, and abstract experiments.
>
> Because both implement the same interface, the simulation, streaming, and viz layers
> never know or care which one is loaded.

---

## 2.1 Concrete realization of each part (locked so far)

| Part | Real component | Direction | Software role in this repo |
|------|----------------|-----------|----------------------------|
| 1 · Molecular | **De-Novo-LLM** (existing repo) generates sonogenetic channel proteins + neuro-interfacing biomolecules | — | External *molecular design service*; we consume its outputs |
| 2 · Hardware (READ) | **Neural dust** — implanted piezo motes, ultrasonic backscatter | brain → sim | `NeuralInput` adapter; v1 uses a **simulated dust reader** |
| 2 · Hardware (WRITE) | **Sonogenetics** — focused ultrasound opens US-sensitive channels Part 1 designed | sim → brain | `NeuralOutput` adapter; v1 uses a **simulated sono writer** |
| 3 · Brain Template | Connectome graph (C. elegans + synthetic, pluggable) | — | `ConnectomeSource` loaders |
| 4 · Virtual environment | Simulation engine + **acoustic channel model** (k-Wave/SIMUS-style) + live viz | — | Core of v1 |

**Golden thread:** Part 1 designs the ion channel → Part 2-WRITE (ultrasound) opens it →
Part 3 says which neurons express it → Part 4 simulates + visualizes the whole loop,
and Part 2-READ (neural dust) closes it. v1 realizes this loop *in simulation* first;
real arrays/motes swap in behind the same contracts later.

## 2.2 First principle: everything configurable (config picks *implementations*)

The project's whole purpose is to climb 302 → 200k → 71M → 86B neurons, so
**configurability is the top architectural constraint**, not a nicety. Rule:

> **Config selects which *implementation* loads for each layer, not just parameter
> values.** Every layer is an interface + a registry; one `config.yaml` names the
> implementation per layer and its params. Worm and mouse become *the same program
> with two config files.*

### Swappable seams (each an interface with a registry)
| Layer | Interface | Implementations (config-selected) |
|-------|-----------|-----------------------------------|
| Connectome (P3) | `ConnectomeSource` | `celegans` · `synthetic` · `microns` |
| Neuron model (P4) | `NeuronModel` | `lif` · `hodgkin_huxley` · `activation` |
| Integrator (P4) | `Stepper` | `cpu_numpy` · `gpu`* · `sparse`* |
| Write path (P2) | `NeuralOutput` | `logging` · `simulated_sono` · `hardware_sono`* |
| Read path (P2) | `NeuralInput` | `synthetic` · `simulated_dust` · `hardware_dust`* |
| Addressing | `AddressingModel` | `idealized` · `realistic` (focal blur × expression, mote pooling) |
| Molecular (P1) | `ChannelLibrary` | `static` · `denovo_llm` (De-Novo-LLM repo) |
| Representation | `TemplateScale` | `per_neuron` · `region_voxel`* · `multiscale_lod`* |
| Rendering | `Renderer` | `full` · `lod`* · `density_field`* |
| Streaming | `Publisher` | `every_tick` · `every_n_ticks` · `on_change` |

`*` = seam designed in v1, second implementation added when we hit MICrONS/scale.

### Disciplines that keep configurability from rotting
1. **Registry pattern** — `register("lif", LIFModel)`; adding a variant = one class +
   one registration, never editing the core. (Mirrors De-Novo-LLM's modality registry.)
2. **Typed, validated config + named profiles** — Pydantic-checked; ship complete
   presets `profiles/worm.yaml`, `profiles/microns.yaml`, `profiles/mouse_mesoscale.yaml`.
   Scaling up = load the next profile.
3. **Capability guards** — invalid combos (e.g. `per_neuron` + 71M on CPU) fail at load
   with a message pointing to the right implementation (`multiscale_lod` + `gpu`).

### Cost control (avoid premature abstraction)
> Design **every seam** now (interface + registry + config), but ship **one real
> implementation per seam** in v1 (worm-scale), plus a stub/second where it proves the
> seam (e.g. `synthetic` beside `celegans`). Second real impls (`microns`, `gpu`,
> `lod`, `hodgkin_huxley`) drop into seams that already exist — reuse without building
> ten things we don't need yet.

## 2.3 The Scalability Contract (binding on EVERY module)

Scalability is a contract every module signs, not a property some happen to have.
No module merges unless it obeys all five rules and declares its scaling path.

| # | Rule | Forbids |
|---|------|---------|
| 1 | **No per-element objects** — state is columnar arrays (SoA), id-indexed | `class Neuron` in a list (dies ~1M) |
| 2 | **Sparse, never dense** — never allocate N×N; connectivity is CSR/COO | 86B×86B matrix |
| 3 | **Linear or better** — ≤ O(N) in neurons, O(E) in synapses; **zero O(N²)** | all-pairs loops |
| 4 | **Bounded memory / out-of-core** — never *require* whole thing in RAM; chunk/mmap/stream | materializing 500M synapses per frame |
| 5 | **Backend-agnostic + query-scoped** — compute behind an array iface (numpy→GPU→distributed); viz/addressing/streaming use region/viewport queries, never full scans | CPU-locked math; redraw-all-per-tick |

### Per-module scaling path (v1 impl → scales to)
| Module | Strategy | Complexity |
|--------|----------|-----------|
| Connectome loader | lazy/streaming, Parquet, chunked | O(E) load, out-of-core |
| Twin state | SoA arrays + spatial index (octree/grid) | O(N) mem, mmap-able |
| Neuron model | vectorized elementwise | O(N)/step |
| Stepper | sparse matvec (`cpu_numpy`→`gpu`→distributed) | O(E)/step |
| Connectivity store | CSR sparse matrix | O(E) mem |
| Acoustic addressing | spatial-index range query | O(neurons near focus) |
| Read/Write (dust/sono) | affected-subset only | O(affected) |
| Environment | sparse stimulus events | O(events) |
| Streaming/Publisher | deltas, view-scoped, binary | O(visible+changed) |
| Renderer | LOD + instancing + aggregation | O(visible) |
| Snapshot/persistence | chunked columnar (zarr/Parquet) | O(N) streamed to disk |
| Config/registry | key lookup | O(1) |

**No module is worse than O(E).** That is the invariant that makes 302 → 86B survivable.

### Partition-native (the choice that reaches 86B / 10¹⁴ synapses)
Sparse+SoA is necessary but not sufficient — 86B neurons don't fit one machine. So the
twin, storage, and compute are **partitioned into spatial region chunks**, never monolithic:
- **Twin** = collection of region chunks → distributable across machines.
- **Storage** = sharded columnar (zarr/Parquet), partitioned by region → out-of-core native.
- **Compute** = `Stepper` runs per-partition; cross-partition synapses are explicit *halo*
  edges → maps to multi-GPU / cluster.
- **v1 worm = 1 partition** (trivial case of the same interface). Human = billions, same code.

### Enforcement (so it's real, not a promise)
1. **Complexity budget in every module docstring** — declared Big-O ceiling; violating PRs fail review.
2. **Scale-tier benchmarks** — a module is "scalable" only once benchmarked at worm (302)
   **and** synthetic **1M and 10M** neurons (`SyntheticSource` exists to prove this without real data).
3. **Capability guards** (§2.2) reject invalid scale/impl combos at config load.
4. **"Scales? + strategy + ceiling"** is part of every module's Definition of Done.

Honest scope: not "everything is O(1)" — touching every neuron is irreducibly O(N).
The contract *forbids the four killers* (objects, dense matrices, O(N²), full
materialization) and *requires each module to declare + benchmark its scaling path*.

## 3. Target architecture

```
                        ┌──────────────────────────────────────────┐
                        │              FRONTEND (Web)                │
   REAL-TIME VIZ  ───▶  │  3D connectome viewer (Three.js / WebGL)   │
                        │  Neuron activity heat-map, spike raster,   │
                        │  time controls, inspector panel            │
                        └───────────────▲────────────────────────────┘
                                        │  WebSocket (live state stream)
                        ┌───────────────┴────────────────────────────┐
                        │              BACKEND (Python)               │
                        │                                             │
   (3) BRAIN TEMPLATE   │  ┌───────────────┐   ┌────────────────────┐ │
   ────────────────────▶│  │ Connectome    │──▶│ Simulation engine  │ │  (4) VIRTUAL
                        │  │ loader/model  │   │ (neuron dynamics + │ │  ENVIRONMENT
                        │  │ (graph + meta)│   │  synaptic update)  │ │
                        │  └───────────────┘   └─────────┬──────────┘ │
                        │                                 │            │
                        │   ┌─────────────────────────────┴────────┐  │
                        │   │  Signal I/O contract (abstract)       │  │
                        │   │  • NeuralInput  (from device → sim)   │  │
                        │   │  • NeuralOutput (from sim → device)   │  │
                        │   └───────▲───────────────────▲──────────┘  │
                        └───────────┼───────────────────┼─────────────┘
                                    │                   │
              ┌─────────────────────┴──┐        ┌───────┴────────────────────┐
   (1) MOLECULAR (future)             │        │       (2) ULTRASOUND HW (future)
   MolecularInterface adapter         │        │       ScannerInterface adapter
   (stub in v1: synthetic stimulus)   │        │       (stub in v1: replay/synthetic)
              └────────────────────────┘        └────────────────────────────┘
```

**Key idea:** the molecular and ultrasound layers implement the *same* `NeuralInput`
/ `NeuralOutput` interface that a **synthetic/stub adapter** implements in v1. Swapping
a stub for real hardware later is a config change, not a rewrite.

---

## 4. Recommended tech stack

| Layer | Choice | Why |
|-------|--------|-----|
| Simulation & data | **Python** (NumPy, NetworkX, optional Brian2) | Scientific standard; NeuroML/connectome tooling lives here |
| Backend API + streaming | **FastAPI + WebSockets** | Async, easy real-time push, typed with Pydantic |
| Connectome format | **NeuroML / JSON** (from OpenWorm) | Real published data; convert once to a compact JSON graph |
| Frontend | **React + TypeScript** | Component model, strong typing |
| 3D rendering | **Three.js via react-three-fiber** + instanced meshes | Proven for browser connectome viz at 300+ nodes |
| State/streaming client | WebSocket + lightweight store (Zustand) | Minimal, fast for live updates |
| Packaging | `uv`/`pip` + Docker; `pnpm` for frontend | Reproducible dev environment |

*(Open to a Python-only v1 with a desktop viewer if you'd rather avoid a web frontend —
see Open Questions.)*

---

## 5. Proposed repository structure

```
brain-computer-interface-v1/
├── docs/
│   ├── PROJECT_PLAN.md            # this file
│   ├── architecture.md           # deep-dive diagrams + rationale
│   └── data-contracts.md         # NeuralInput/Output + connectome schema specs
├── data/
│   └── connectomes/              # downloaded + converted connectome files (gitignored raw)
├── backend/
│   ├── bci/
│   │   ├── connectome/           # (3) Brain Template: ConnectomeSource, CElegans + Synthetic loaders, graph model
│   │   ├── simulation/           # (4) Virtual env: neuron models, integrator, stepper
│   │   ├── io/                   # signal contracts + stub adapters (molecular/scanner)
│   │   ├── streaming/            # WebSocket server, state serialization
│   │   └── api/                  # FastAPI app, endpoints
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── viz/                  # Three.js connectome scene, instanced neurons/edges
│   │   ├── panels/              # inspector, spike raster, time controls
│   │   ├── net/                 # WebSocket client, decode/state store
│   │   └── app/
│   └── ...
└── README.md
```

---

## 5.1 Part 4 — the virtual environment (design)

The virtual environment runs the twin and closes the loop. Built human-brain-first:
sim scale is decoupled from viz scale, and nothing is worm-specific.

**Five sub-systems (all obey §2.2 config + §2.3 scalability):**

1. **Sim core** — `Stepper` over SoA state + CSR connectivity → one step = sparse matvec.
   v1 `cpu_numpy`; seam for `gpu` / distributed. O(E)/step.
2. **Acoustic channel** — `AddressingModel` maps neuron ids ↔ focal coordinates.
   WRITE = focal_mask × expression (sonogenetic); READ = mote pooling (neural dust).
   v1 `idealized`; seam for `realistic`. Spatial-index queries, O(near focus).
3. **Environment** — `Environment` seam. Default `stimulus_protocol` (universal
   sensory-in / activity-out, worm→human); optional `worm_body` (OpenWorm-style).
   Stimuli as sparse events, O(events).
4. **Observation/streaming** — sim runs full-scale headless; viz gets a
   **view-dependent, delta, binary** projection ("this region @ this zoom").
   v1 `every_tick` all-302; same protocol later streams viewport subset. O(visible+changed).
5. **Visualization** — LOD renderer (instancing → density fields). v1 `full`; seam for `lod`.

**The loop per tick:** `read (dust) → step → write (sono) → publish snapshot`.
One authoritative loop mutates the twin; everyone else reads immutable snapshots (§6.3).

**Open refinements (settle at build):** focal-blur on/off in v1; snapshot every-tick vs every-N.

---

## 6. Data & signal contracts (design-first)

### 6.1 Connectome schema (the Brain Template)
```jsonc
{
  "neurons": [
    { "id": "AVAL", "type": "interneuron", "pos": [x,y,z], "class": "AVA" }
  ],
  "synapses": [
    { "pre": "AVAL", "post": "AVAR", "kind": "electrical", "weight": 3 },
    { "pre": "AVBL", "post": "PVCL", "kind": "chemical",   "weight": 7 }
  ]
}
```

### 6.1a Scale ladder — the multi-scale Brain Template (North Star: human)

The Template is **multi-scale / level-of-detail (LOD)**: the same twin represented at
different granularities, with the viz swapping representation by zoom ("Google Maps for
the brain"). Each rung is a *real, buildable tier* behind the same `ConnectomeSource`.

| Rung | Source | Neurons | Data status | Fidelity | Role |
|------|--------|---------|-------------|----------|------|
| 1 | **C. elegans** (OpenWorm) | 302 | ✅ real & complete | per-neuron/synapse | v1 anchor — prove the loop |
| 2 | **MICrONS `minnie65`** (mouse V1 mm³) | ~200k (proofread subset first) | ✅ real EM (CAVE) | per-neuron/synapse | "first mouse" — prove LOD/scale |
| 3 | **Mouse mesoscale** (Allen Connectivity Atlas) | ~71M via ~regions | ✅ real (region-level) | neural-mass per region | whole mouse (not per-synapse) |
| 4 | **Human** | ~86B / ~10¹⁴ syn | ✖ statistical only | population/region models | North Star |

Notes that shape the design:
- **No whole-mouse per-synapse connectome exists** — Rung 3 is region-level neural-mass,
  and any per-neuron whole-mouse twin must be *generated* (mesoscale + statistical wiring
  → `SyntheticSource` territory).
- **Whole-mouse/human real-time per-neuron sim is HPC-class**, not v1. LOD + region
  aggregation is how the viz stays real-time at scale.
- `MICrONSSource`: pull graph via `caveclient` (`minnie65_public`, `client.materialize`
  synapse + cell-type + proofread tables), soma coords via CloudVolume; extract nodes+edges,
  normalize to the standard schema, cache as Parquet. The petabyte of EM imagery is *not*
  needed — only the connectivity graph.

### 6.1b Pluggable connectome source (C. elegans OR synthetic OR MICrONS)
```python
class ConnectomeSource(Protocol):
    """Anything that can produce a Connectome graph."""
    def load(self) -> Connectome: ...        # -> normalized {neurons, synapses}

class CElegansSource:   # loads + converts OpenWorm NeuroML/CSV to the schema above
    ...
class SyntheticSource:  # generates N neurons with configurable wiring + seed
    def __init__(self, n: int, wiring: WiringRule, seed: int): ...
class MICrONSSource:    # pulls minnie65_public graph via caveclient, caches Parquet
    def __init__(self, proofread_only: bool = True, region: str | None = None): ...
```
The rest of the system depends only on the normalized `Connectome` — never on which
source produced it. Adding a third connectome later = one new class.

### 6.2 Signal I/O contracts (so molecular + hardware plug in later)

**Locked mechanism pairing:** READ = **neural dust** (ultrasonic backscatter),
WRITE = **sonogenetics** (ultrasound-gated ion channels). These are two distinct
physical subsystems, so the contracts are split accordingly:

```python
class NeuralInput(Protocol):
    """READ path — neural dust backscatter → per-neuron activity.
    Real impl: NeuralDustReader (demodulate backscatter from an ultrasound array).
    v1 stub:  SyntheticInput / SimulatedDustReader (from the acoustic sim)."""
    def read(self) -> dict[NeuronId, float]: ...

class NeuralOutput(Protocol):
    """WRITE path — sonogenetic stimulation → drive selected neurons.
    Real impl: SonogeneticWriter (focused ultrasound opens US-sensitive channels
               on neurons that Part 1 made sonosensitive).
    v1 stub:  LoggingOutput / SimulatedSonoWriter (into the acoustic sim)."""
    def write(self, targets: dict[NeuronId, float]) -> None: ...
```

Because read and write are separate hardware, the loop is only "closed" in software
(and in the acoustic simulator) until both arrays exist.

### 6.3 Live state frame (backend → frontend, per tick)
```jsonc
{ "t": 12.34, "activity": { "AVAL": 0.82, "AVAR": 0.10, ... }, "spikes": ["AVAL"] }
```

---

## 6.3 The Brain Template — a living digital twin (design B, locked)

The Template is **the brain object itself**, not passive data. It owns three layers in
one stateful object; the simulation engine is a *stepper* that mutates it in place, and
the visualization + I/O adapters all read/write **this single source of truth**.

```
BrainTemplate  (the living digital twin — one object, the source of truth)
├── structure      neurons + synapses          (immutable after load; from ConnectomeSource)
├── annotation     per-neuron BCI addressing    (mostly static)
│     ├── sono:  is sonosensitive? channel id (from De-Novo-LLM), dose→open curve
│     ├── dust:  has a mote? mote id, backscatter signature
│     └── space: 3D coordinate (focal-point addressing for ultrasound)
└── state         live per-neuron values        (mutated every tick)
      ├── v (membrane potential), spiking, refractory timer
      └── last-write / last-read bookkeeping
```

**Consequences of choosing "living object" (B):**
- **Engine = stepper, not state-owner.** `engine.step(brain, dt)` mutates `brain.state`
  in place. No separate state store to keep in sync.
- **Single ownership / one loop.** To avoid races between step, viz-read, and
  Part-2 adapter read/write, the sim runs one authoritative loop: `read inputs →
  step → apply outputs → publish snapshot`. Everyone else consumes **immutable
  per-tick snapshots**, never the live object directly.
- **Snapshot-able.** The twin must serialize (save/load/`scrub time`) → enables
  reproducibility, rewind, and "load a brain state."
- **Uniform identity + coordinates** across sources: C. elegans (named neurons, real
  positions) and synthetic (generated ids/positions) both fill the same Template shape,
  so nothing downstream knows which was loaded.

## 7. Simulation model for v1

Start simple and correct, leave room to deepen:

- **v1 default:** leaky integrate-and-fire (LIF) neurons + weighted synaptic input —
  fast, stable, runs 302 neurons in real time easily, easy to reason about.
- **Upgrade path:** swap the neuron model to Hodgkin–Huxley (as OpenWorm/`c302` use)
  behind the same `NeuronModel` interface without touching the network or viz layers.
- Fixed-step integrator with a configurable `dt`; backend streams every N steps so the
  UI stays real-time regardless of internal step size.

---

## 8. Milestones / phased build (each phase ends in something you can see)

| Phase | Deliverable | "Done" looks like |
|-------|-------------|-------------------|
| **P0** | Repo scaffold + this plan committed | dirs, tooling, CI skeleton, README |
| **P1** | Connectome loaded & rendered (static) | 302 neurons in 3D in the browser, rotatable, clickable |
| **P2** | Simulation engine (headless) | LIF network steps; tests show plausible activity; CLI run |
| **P3** | Live streaming + real-time viz | neurons light up in real time as sim runs — **v1 headline** |
| **P4** | Stub signal I/O + stimulus control | inject a stimulus pattern from the UI, watch it propagate |
| **P5** | Polish: inspector, spike raster, presets, docs | shareable demo, documented data contracts |

Future (post-v1): real molecular adapter, ultrasound scanner adapter, larger/other
connectomes, biophysically detailed neuron models, closed-loop control.

---

## 9. Open questions still to resolve

Resolved: frontend (web ✅), connectome (pluggable ✅), neuron model (LIF→HH ✅).

Still open:

1. **Scope of the molecular/ultrasound layers in v1:** contracts + simple stub adapters
   only (current assumption), or a richer *simulated* device model (e.g. modeled
   ultrasound read/write latency, spatial resolution, noise)?
2. **Interaction depth of the live viz:** just watch activity, or also *drive* it live
   (click a neuron to stimulate, load stimulus presets, scrub time)?
3. **Scale target for `SyntheticSource`:** should v1 aim to stay real-time at, say,
   10k+ synthetic neurons (affects rendering strategy — instancing/LOD/GPU), or is
   "302-scale + modest synthetic nets" enough for v1?
4. **Validation goal:** do we want v1 to reproduce any *known* C. elegans behavior
   (e.g. touch-response reflex circuit) as a correctness check, or is plausible
   activity enough for v1?
5. **Repo/tooling preferences:** license, Python packaging (`uv` vs `poetry` vs pip),
   CI provider, and whether to Dockerize from P0.

---

## 10. Sources (grounding)

- OpenWorm project overview — Frontiers in Computational Neuroscience
- `c302` multiscale C. elegans nervous-system framework — Royal Society / PMC
- Integrative data-driven C. elegans brain/body/environment model — Nature Comp. Science
- Realtime connectome visualization in the browser using WebGL; NeuroCave; Neural
  Circuit Visualizer (three.js / react-three-fiber precedents)
