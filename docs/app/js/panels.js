// Control-plane tab panels. Brain template = live 3D viewer. Biomolecules, Scanner and
// System are interactive (they drive / read the same running BrainSim, window.__sim).
// Virtual env is an info panel (the worm is live in the Brain template).

import { renderBiomolecules, demoChannels, chanType } from './molecular.js';
import { TestBench } from './testbench.js';

// Virtual env in stage mode: the live 3D brain shows behind (panel is transparent), the
// crawling twin is the .venv aside on the right, and a floating card explains the loop —
// exactly the Brain-template cockpit, focused on the environment.
function renderVenv(el) {
  el.classList.add('stage');
  el.innerHTML = `
    <div class="overlay stats" style="max-width:320px">
      <div class="eyebrow">Part 4 · Virtual environment</div>
      <h3>The simulated world</h3>
      <p class="muted small" style="margin:.1rem 0 .7rem">One authoritative loop —
        <b>read (dust) → step → write (sono) → publish</b> — over the living twin. Locomotion is
        <b>decoded live from the command neurons</b>, with no scripted motion.</p>
      <div class="statrow"><span>neuron model</span><b>LIF</b></div>
      <div class="statrow"><span>stepper</span><b>sparse matvec</b></div>
      <div class="statrow"><span>environment</span><b>stimulus_protocol</b></div>
      <div class="muted small">The crawling twin on the right → is driven by this loop. Open
        <b>Brain template</b> and press ▶ Run to drive AVB (forward) or AVA (reverse).</div>
    </div>`;
}

const TARGETS = [['rev', 'reverse cmd (AVA)'], ['fwd', 'forward cmd (AVB)'],
  ['touchPost', 'posterior touch (PLM)'], ['touchAnt', 'anterior touch (ALM/AVM)']];

let liveTimer = null, scanBench = null;
function stopLive() {
  if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
  if (scanBench) { scanBench.stop(); scanBench = null; }
}

function renderScanner(el) {
  el.classList.add('stage');
  el.innerHTML = `
    <canvas id="sc-canvas" class="stage-canvas" style="cursor:crosshair"></canvas>
    <div class="overlay stats">
      <div class="eyebrow">Scanner · 🟢 neural dust</div>
      <h3>Read-out</h3>
      <div class="statrow"><span>active motes</span><b id="sc-firing">—</b></div>
      <div class="statrow"><span>mean backscatter</span><b id="sc-mean">—</b></div>
      <div class="statrow"><span>readout now</span><b id="sc-now">—</b></div>
      <div class="muted small">Motes backscatter the local activity of the loaded brain — the read half of the BCI.</div>
    </div>
    <div class="overlay controls">
      <div class="eyebrow">🔊 Sonogenetics · write</div>
      <div class="seg" id="sc-view">
        <button class="seg-btn active" data-v="2d">2D bench</button>
        <button class="seg-btn" data-v="3d">3D brain</button>
      </div>
      <div class="zoom-row" id="sc-zoom">zoom
        <button class="zoom-btn" id="sc-zin" title="zoom in">＋</button>
        <button class="zoom-btn" id="sc-zout" title="zoom out">－</button>
        <button class="zoom-btn" id="sc-zreset" title="reset view">⤢</button>
        <span class="muted" style="text-transform:none">· or scroll on the tissue</span>
      </div>
      <label class="field">channel
        <select id="sc-chan"><option value="direct">— direct (no molecule) —</option></select></label>
      <label class="field">effect
        <select id="sc-sign"><option value="1">excite (cation)</option><option value="-1">inhibit (anion)</option></select></label>
      <label class="ctl">pressure <input id="sc-gain" type="range" min="1" max="7" step="0.5" value="5"><span id="sc-gain-v">5</span></label>
      <button class="btn act" id="sc-pulse">🔊 Deliver ultrasound pulse</button>
      <div class="muted small" id="sc-hint">Click the tissue to aim the focus. A molecule scales the same pulse by its <b>sensitivity × conductance</b>, so each one lands differently.</div>
    </div>`;

  const data = window.__connectome;
  const canvas = el.querySelector('#sc-canvas');
  el.querySelector('#sc-gain').addEventListener('input', (e) => { el.querySelector('#sc-gain-v').textContent = e.target.value; });

  if (!data) { canvas.style.display = 'none'; return; }
  requestAnimationFrame(() => {
    scanBench = window.__scanBench = new TestBench(canvas, data,
      { sensitivity: 1, conductance: 1, sign: 1, target: '', locus: [0.5, 0.45] }, null, { interactive: true });
    scanBench.startLive();
  });

  canvas.addEventListener('click', (e) => {
    if (!scanBench || scView !== '2d') return;
    const r = canvas.getBoundingClientRect();
    scanBench.aimAt(e.clientX - r.left, e.clientY - r.top);
  });

  // zoom controls (2D bench only — the 3D brain has its own orbit/zoom)
  el.querySelector('#sc-zin').addEventListener('click', () => scanBench && scanBench.zoomAt(1.25));
  el.querySelector('#sc-zout').addEventListener('click', () => scanBench && scanBench.zoomAt(1 / 1.25));
  el.querySelector('#sc-zreset').addEventListener('click', () => scanBench && scanBench.resetView());
  canvas.addEventListener('wheel', (e) => {
    if (!scanBench || scView !== '2d') return;
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    scanBench.zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  // 2D bench (opaque, covers the 3D brain) ⇄ 3D brain (hide the bench to reveal it)
  let scView = '2d';
  const hint = el.querySelector('#sc-hint');
  el.querySelector('#sc-view').addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn'); if (!btn) return;
    scView = btn.dataset.v;
    el.querySelectorAll('#sc-view .seg-btn').forEach((b) => b.classList.toggle('active', b === btn));
    canvas.style.display = scView === '2d' ? '' : 'none';
    el.querySelector('#sc-zoom').style.display = scView === '2d' ? '' : 'none';
    hint.innerHTML = scView === '2d'
      ? 'Click the tissue to aim the focus. A molecule scales the same pulse by its <b>sensitivity × conductance</b>, so each one lands differently.'
      : 'Now driving the <b>live 3D brain</b> — the pulse stimulates a patch of the real connectome; watch it light up and read out below.';
  });

  // channel selector — load a generated molecule so the pulse uses its sensitivity × conductance
  let channels = [];
  const chanSel = el.querySelector('#sc-chan'), signSel = el.querySelector('#sc-sign');
  demoChannels('smiles', 4).then((cs) => {
    channels = cs;
    chanSel.insertAdjacentHTML('beforeend', cs.map((c, i) =>
      `<option value="${i}">${c.id} · ${chanType(c)} · sens ${c.sensitivity.toFixed(2)} · g ${c.conductance.toFixed(2)}</option>`).join(''));
  });
  chanSel.addEventListener('change', () => {
    const ch = chanSel.value === 'direct' ? null : channels[+chanSel.value];
    if (ch) { signSel.value = String(ch.sign); signSel.disabled = true; }
    else signSel.disabled = false;
  });

  el.querySelector('#sc-pulse').addEventListener('click', () => {
    const pressure = +el.querySelector('#sc-gain').value;
    const ch = chanSel.value === 'direct' ? null : channels[+chanSel.value];
    const sign = ch ? ch.sign : +signSel.value;
    const gain = ch ? pressure * ch.sensitivity * ch.conductance : pressure;
    // a molecule scales the SAME pressure by its channel sensitivity × conductance; direct mode
    // drives the ultrasound raw (sensitivity = conductance = 1).
    if (scView === '2d') { if (scanBench) scanBench.firePulse(sign, gain); }
    else if (window.__sim) {                                    // drive the real 3D sim
      window.__sim.stimulatePatch(0.12, sign * gain * 0.9);
      if (window.__ensureRunning) window.__ensureRunning();       // step it so the pulse propagates
    }
  });
  liveTimer = setInterval(() => {
    let motesActive = '—', backscatter = '—', readout = 0;
    if (scView === '2d') {
      if (!scanBench) return;
      const s = scanBench.liveStats();
      motesActive = s.motesActive; backscatter = s.backscatter; readout = s.readout;
    } else {
      const st = sim3dStats(); if (!st) return;
      motesActive = st.active; backscatter = st.mean.toFixed(3); readout = st.mean;
    }
    el.querySelector('#sc-firing').textContent = motesActive;
    el.querySelector('#sc-mean').textContent = backscatter;
    el.querySelector('#sc-now').textContent = (+readout).toFixed(3);
  }, 150);
}

// read-out from the live 3D BrainSim (used when a stage panel is in "3D brain" view)
function sim3dStats() {
  const s = window.__sim; if (!s) return null;
  let active = 0, sum = 0;
  for (let i = 0; i < s.n; i++) { const a = s.act[i]; if (a > 0.1) active++; sum += a; }
  return { active, mean: s.n ? sum / s.n : 0 };
}

function renderSystem(el) {
  el.innerHTML = `<div class="panel-inner">
    <div class="eyebrow">System</div>
    <h2>Live runtime &amp; tuning</h2>
    <p style="max-width:64ch">Every layer is a config-selected implementation (PLAN §2.2).
    Below you can <b>tune the running brain live</b> — the sliders write straight into the
    simulation. Watch the effect in the Brain template.</p>
    <div class="pgrid">
      <div class="card"><div class="label">tick</div><b id="sy-t">—</b></div>
      <div class="card"><div class="label">firing now</div><b id="sy-fire">—</b></div>
      <div class="card"><div class="label">locomotion</div><b id="sy-loco">—</b></div>
    </div>
    <div class="card" style="margin-top:2px">
      <b>Live parameters</b>
      <label class="ctl" style="margin-top:.5rem">background excitability <input id="sy-bias" type="range" min="0" max="0.12" step="0.005" value="0.05"><span id="sy-bias-v"></span></label>
      <label class="ctl">synaptic gain <input id="sy-gsyn" type="range" min="0.5" max="4" step="0.1" value="2.0"><span id="sy-gsyn-v"></span></label>
      <label class="ctl">global inhibition <input id="sy-inh" type="range" min="0.5" max="4" step="0.1" value="2.2"><span id="sy-inh-v"></span></label>
      <button class="btn act" id="sy-reset" style="margin-top:.6rem">reset simulation</button>
    </div>
    <table style="margin-top:16px">
      <thead><tr><th>Rung</th><th>Neurons</th><th>Synapses</th><th>Data</th></tr></thead>
      <tbody>
        <tr><td>C. elegans (worm)</td><td>302</td><td>~7,000</td><td><span class="chip allow">real</span></td></tr>
        <tr><td>Drosophila (FlyWire)</td><td>~130,000</td><td>~50,000,000</td><td><span class="chip allow">real</span></td></tr>
        <tr><td>MICrONS mouse V1</td><td>~200,000</td><td>~500,000,000</td><td><span class="chip allow">real</span></td></tr>
        <tr><td>Mouse mesoscale</td><td>1e5 … 71M</td><td>scales with N</td><td><span class="chip deny">statistical</span></td></tr>
        <tr><td>Human (North Star)</td><td>~86,000,000,000</td><td>~10¹⁴</td><td><span class="chip deny">statistical</span></td></tr>
      </tbody>
    </table>
    <p class="muted">Run a live backend with <code>bci serve</code> (REST + WebSocket).</p>
  </div>`;
  const bind = (id, prop) => {
    const inp = el.querySelector(`#sy-${id}`), out = el.querySelector(`#sy-${id}-v`);
    const apply = () => { out.textContent = inp.value; if (window.__sim) window.__sim[prop] = +inp.value; };
    if (window.__sim) inp.value = window.__sim[prop];
    apply(); inp.addEventListener('input', apply);
  };
  bind('bias', 'bias'); bind('gsyn', 'gsyn'); bind('inh', 'globalInh');
  el.querySelector('#sy-reset').addEventListener('click', () => window.__sim && window.__sim.reset());
  liveTimer = setInterval(() => {
    const s = window.__sim; if (!s) return;
    let f = 0; for (let i = 0; i < s.n; i++) if (s.act[i] > 0.1) f++;
    el.querySelector('#sy-t').textContent = s.t.toLocaleString();
    el.querySelector('#sy-fire').textContent = f;
    const loco = s.locomotion();
    el.querySelector('#sy-loco').textContent = `${loco >= 0 ? '+' : ''}${loco.toFixed(3)}`;
  }, 150);
}

// ---- roadmap scaffolds -------------------------------------------------------
// Cockpit-view panels (floating card over the live 3D brain) that lay out each stage's
// pipeline, with real demo actions where trivial. Each gets deepened into a full tool later.
const SCAFFOLDS = {
  physics: {
    eyebrow: 'Part · Physics', title: 'Molecular & wave interaction physics',
    intro: 'The model behind Biomolecules & Scanner — how a sequence becomes a neural effect, and how waves couple into the tissue.',
    pipe: [
      ['Sequence → channel', 'charge → cation (excite) / anion (inhibit); length → conductance; hydrophobicity → ultrasound sensitivity'],
      ['Channel → membrane', 'the open channel injects current at the expressing neurons (LIF): excitation depolarizes, inhibition hyperpolarizes'],
      ['Synapse propagation', 'input-normalized weights × the E/I sign carry the effect through the real connectome'],
      ['Wave coupling', 'focused ultrasound opens the channel only at the focal spot; pressure × sensitivity × conductance sets the drive'],
      ['Read-out', 'neural-dust motes backscatter local activity — the measured effect'],
    ], status: 'live in Biomolecules & Scanner · dedicated view next',
  },
  waves: {
    eyebrow: 'Part · Waves', title: 'Wave design & targeting',
    intro: 'Experiment with different waves to target neurons, combine waves to cover blind spots, and invent new waveforms.',
    pipe: [
      ['Waveforms', 'pulse · continuous · burst · frequency sweep (chirp) — each has a different focal size and depth'],
      ['Targeting', 'aim the focus; frequency sets the focal spot / penetration, pressure sets the drive'],
      ['Waves × biomolecules', 'the loaded channel scales every wave by its sensitivity × conductance'],
      ['Combine to cover blind spots', 'sum multiple foci / waveforms so neurons missed by one wave are reached by another'],
      ['Invent new waves', 'borrow the generator from inventor-studio-v3 to synthesize novel waveforms'],
    ], status: 'ultrasound live in Scanner · multi-wave bench next',
  },
  electronics: {
    eyebrow: 'Part · Electronics', title: 'Schematic & PCB generation',
    intro: 'Generate the read/write electronics — bio-AFE, stimulator, MCU — as a schematic and PCB, ported from inventor-studio-v3 (Node → Python).',
    pipe: [
      ['Concept → schematic', 'an LLM emits components + connections (inventor-studio-v3 pipeline)'],
      ['Sanitize', 'drop broken / duplicate nets, normalize component IDs'],
      ['BOM', 'bill of materials with part references'],
      ['PCB layout', 'place & route onto a board outline'],
    ],
    action: '<button class="btn act" id="el-gen" style="margin-top:.5rem">Generate sample schematic</button><div class="scaffold-out" id="el-out"></div>',
    status: 'Node → Python port pending', wire: wireElectronics,
  },
  hardware: {
    eyebrow: 'Part · Hardware', title: 'Enclosure & sensor casing',
    intro: 'Parametric CAD to house the electronics and the sensors (ultrasound transducer, neural-dust array).',
    pipe: [
      ['Board dims → enclosure', 'derive a case from the PCB outline + connector cutouts'],
      ['Sensor casing', 'mounts for the transducer & dust array, with an acoustic window'],
      ['Parametric CAD', 'JSCAD / OpenSCAD model → mesh'],
      ['Export mesh', 'STL / 3MF, ready for printing'],
    ], status: 'CAD generator next',
  },
  print: {
    eyebrow: 'Part · 3D printing', title: 'Prototype → printer',
    intro: 'Take the enclosure mesh from the Fusion results table, export a print file, and send it to the printer.',
    pipe: [
      ['Get file', 'pull the enclosure STL referenced in the Fusion table'],
      ['Slice', 'export print-ready geometry'],
      ['Send', 'stream to the 3D printer (OctoPrint / USB)'],
    ],
    action: '<button class="btn act" id="pr-stl" style="margin-top:.5rem">Export sample enclosure .stl</button><div class="scaffold-out muted small" id="pr-out"></div>',
    status: 'printer link next', wire: wirePrint,
  },
};

function renderScaffold(el, key) {
  const c = SCAFFOLDS[key];
  el.classList.add('stage');
  el.innerHTML = `<div class="overlay stats scaffold">
    <div class="eyebrow">${c.eyebrow}</div>
    <h3>${c.title}</h3>
    <p class="muted small">${c.intro}</p>
    <ol class="pipe">${c.pipe.map(([t, d], i) =>
      `<li><span class="n">${i + 1}</span><span><b>${t}</b><br><span class="d">${d}</span></span></li>`).join('')}</ol>
    ${c.action || ''}
    <div style="margin-top:.7rem"><span class="tag-soon">${c.status}</span></div>
  </div>`;
  if (c.wire) c.wire(el);
}

function wireElectronics(el) {
  el.querySelector('#el-gen').addEventListener('click', () => {
    const comps = [['U1', 'MCU', 'ESP32-S3'], ['U2', 'Bio-AFE', 'ADS1299 (8-ch)'], ['U3', 'Stimulator', 'constant-current'],
      ['U4', 'US driver', 'MOSFET H-bridge'], ['J1', 'Electrodes', '8-ch header'], ['PM1', 'PMIC + batt', 'Li-Po 3.7V']];
    const nets = ['J1→U2 (electrodes)', 'U2→U1 (SPI)', 'U1→U3 (stim ctrl)', 'U1→U4 (US ctrl)', 'PM1→all (power)'];
    el.querySelector('#el-out').innerHTML = `<b class="small">Sample BCI front-end</b>
      <table class="mini"><tbody>${comps.map((c) => `<tr><td><b>${c[0]}</b></td><td>${c[1]}</td><td class="muted">${c[2]}</td></tr>`).join('')}</tbody></table>
      <div class="muted small" style="margin-top:.3rem">nets: ${nets.join(' · ')}</div>
      <div class="muted small">demo shape from inventor-studio-v3's Circuit model — live LLM generation lands after the Python port.</div>`;
  });
}

function boxSTL(name, X, Y, Z) {   // ASCII STL of an axis-aligned box (a stand-in enclosure)
  const hx = X / 2, hy = Y / 2, hz = Z / 2;
  const v = [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz], [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]];
  const faces = [[0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6], [0, 4, 5], [0, 5, 1], [1, 5, 6], [1, 6, 2], [2, 6, 7], [2, 7, 3], [3, 7, 4], [3, 4, 0]];
  let s = `solid ${name}\n`;
  for (const f of faces) {
    s += ' facet normal 0 0 0\n  outer loop\n';
    for (const i of f) s += `   vertex ${v[i][0]} ${v[i][1]} ${v[i][2]}\n`;
    s += '  endloop\n endfacet\n';
  }
  return s + `endsolid ${name}\n`;
}
function wirePrint(el) {
  el.querySelector('#pr-stl').addEventListener('click', () => {
    const stl = boxSTL('bci_enclosure', 60, 40, 18);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([stl], { type: 'model/stl' }));
    a.download = 'bci_enclosure.stl'; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(a.href);
    el.querySelector('#pr-out').textContent = 'Exported bci_enclosure.stl (60 × 40 × 18 mm box) — a real print file; the parametric enclosure lands with the Hardware CAD generator.';
  });
}

function renderFusion(el) {
  el.classList.add('stage');
  const cx = (window.__connectome && window.__connectome.name) || '—';
  const rows = [
    ['Connectome', cx, 'loaded'], ['Molecule / channel', 'generate in Biomolecules', 'pending'],
    ['Wave', 'focused ultrasound (Scanner)', 'live'], ['Electronics', 'sample schematic', 'demo'],
    ['Hardware', 'enclosure params', 'pending'], ['Print file', 'bci_enclosure.stl', 'export ready'],
  ];
  const ok = (s) => ['loaded', 'live', 'export ready'].includes(s) ? 'ok' : '';
  el.innerHTML = `<div class="overlay stats scaffold" style="max-width:470px">
    <div class="eyebrow">Part · Fusion</div><h3>Combine everything · one view</h3>
    <p class="muted small">Assemble the whole stack over the connectome, run an experiment, and log each result.</p>
    <table class="mini"><thead><tr><th>stage</th><th>artifact</th><th>status</th></tr></thead>
    <tbody>${rows.map((r) => `<tr><td>${r[0]}</td><td class="muted">${r[1]}</td><td><span class="chip ${ok(r[2])}">${r[2]}</span></td></tr>`).join('')}</tbody></table>
    <div style="margin-top:.7rem"><span class="tag-soon">experiment runner + CSV results export next</span></div>
  </div>`;
}

const panel = document.getElementById('panel');
const tabs = [...document.querySelectorAll('.tab')];
let activeKey = null;

const viewer = document.getElementById('viewer');

function renderPanel(key) {
  activeKey = key;
  stopLive();
  panel.classList.remove('stage');          // System uses document mode; the rest re-add it
  if (key === 'brain') {
    panel.hidden = true; panel.innerHTML = ''; viewer.classList.remove('panelling'); return;
  }
  panel.hidden = false;
  viewer.classList.add('panelling');         // hide the Brain-template's own floating cards
  if (key === 'biomolecules') renderBiomolecules(panel);
  else if (key === 'scanner') renderScanner(panel);
  else if (key === 'system') renderSystem(panel);
  else if (key === 'venv') renderVenv(panel);
  else if (key === 'fusion') renderFusion(panel);
  else if (SCAFFOLDS[key]) renderScaffold(panel, key);
  else renderVenv(panel);
}

tabs.forEach((t) => t.addEventListener('click', () => {
  tabs.forEach((x) => x.classList.toggle('active', x === t));
  renderPanel(t.dataset.tab);
}));

// When the connectome changes while a panel is open, retarget it instead of losing the view.
// Scanner rebuilds its bench on the new brain; System re-reads window.__sim on its next tick;
// Biomolecules keeps its generated channels (Test already uses the current brain).
window.addEventListener('connectome-changed', () => {
  if (panel.hidden) return;
  if (activeKey === 'scanner') { stopLive(); renderScanner(panel); }
  else if (activeKey === 'biomolecules') renderBiomolecules(panel);
});
