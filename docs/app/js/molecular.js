// Biomolecules panel (Part 1) — Generate → Test on the connectome, with a visible test bench.
// Live mode: calls the backend API (real De-Novo-LLM / NVIDIA NIM). Demo mode (hosted, no
// backend): bundled samples + a browser assay. Pressing Test opens a canvas showing the
// SELECTED connectome and runs the real BCI loop on it: sonogenetics ultrasound writes →
// connectome responds → neural dust reads. See testbench.js.

import { TestBench } from './testbench.js';

const TARGETS = [
  ['rev', 'reverse command (AVA) → reversal'],
  ['fwd', 'forward command (AVB) → forward'],
  ['touchPost', 'posterior touch (PLM)'],
];
const HYDRO = new Set('AILMFWVY');
const BASIC = new Set('KRH'), ACIDIC = new Set('DE');

function sensitivity(seq, modality) {
  const protein = modality === 'protein' || modality === 'peptide';
  let f;
  if (protein) {
    const L = [...seq.toUpperCase()].filter((c) => /[A-Z]/.test(c));
    f = L.length ? L.filter((c) => HYDRO.has(c)).length / L.length : 0;
  } else {
    const arom = [...seq].filter((c) => 'cnops'.includes(c)).length;
    const rings = [...seq].filter((c) => /[0-9]/.test(c)).length;
    f = Math.min(1, ((arom + rings) / Math.max(seq.length, 1)) * 3);
  }
  return +(0.2 + 0.65 * Math.max(0, Math.min(1, f))).toFixed(3);
}

// sequence → channel biophysics (a TRANSPARENT composition proxy, not a validated predictor):
//   sign        cation-selective (excitatory, +1) vs anion-selective (inhibitory, −1),
//               from net residue/heteroatom charge
//   sensitivity ultrasound coupling (hydrophobic / aromatic-ring content)
//   conductance pore size proxy from length
// deterministic expression locus [u,v] in [0,1]² from the sequence — where the channel gets
// expressed (a targeting proxy), so different molecules land on different parts of the tissue.
function seqLocus(seq) {
  let h1 = 2166136261 >>> 0, h2 = 5381 >>> 0;
  for (let i = 0; i < seq.length; i++) {
    const c = seq.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = ((h2 << 5) + h2 + c) >>> 0;
  }
  return [(h1 % 997) / 997, (h2 % 991) / 991];
}

function channelSpec(seq, modality) {
  const sens = sensitivity(seq, modality);
  const s = seq.toUpperCase();
  let sign, conductance;
  if (modality === 'protein' || modality === 'peptide') {
    const L = [...s].filter((c) => /[A-Z]/.test(c));
    const pos = L.filter((c) => BASIC.has(c)).length, neg = L.filter((c) => ACIDIC.has(c)).length;
    sign = (pos - neg) >= 0 ? 1 : -1;
    conductance = +(0.5 + 0.5 * Math.min(1, L.length / 40)).toFixed(2);
  } else {
    const plus = (seq.match(/\+/g) || []).length, minus = (seq.match(/-/g) || []).length;
    const nitro = (s.match(/N/g) || []).length, oxy = (s.match(/O/g) || []).length;
    sign = (plus - minus) + (nitro - oxy) * 0.15 >= 0 ? 1 : -1;
    conductance = +(0.5 + 0.5 * Math.min(1, seq.length / 50)).toFixed(2);
  }
  return { sensitivity: sens, sign, conductance, locus: seqLocus(seq) };
}

const chanType = (ch) => ch.sign > 0 ? 'cation · excite' : 'anion · inhibit';

let _data = null, _samples = null, _live = null, _bench = null, _bioView = '2d';
let _view = { z: 1, x: 0, y: 0 };   // remembered zoom/pan, carried across bench recreation
const captureView = (b) => { if (b) _view = { z: b.zoom, x: b.panX, y: b.panY }; };
const applyView = (b) => { if (b) { b.zoom = _view.z; b.panX = _view.x; b.panY = _view.y; b._applyView(); } };

// exposed so the Scanner can load a molecule's channel and use its real sensitivity/conductance
export { channelSpec, chanType };
export async function demoChannels(modality = 'smiles', n = 4) {
  const pool = (await samples())[modality] || (await samples()).smiles;
  return Array.from({ length: n }, (_, i) => {
    const seq = pool[i % pool.length];
    return { id: `${modality.slice(0, 3)}-${String(i).padStart(2, '0')}`, sequence: seq, modality, ...channelSpec(seq, modality) };
  });
}

async function connectomeData() {
  if (window.__connectome) return window.__connectome;   // the currently-loaded brain
  if (!_data) _data = await fetch('./data/celegans.json').then((r) => r.json());
  return _data;
}
async function samples() {
  if (!_samples) _samples = await fetch('./data/molecular_samples.json').then((r) => r.json());
  return _samples;
}
async function detectLive() {
  if (_live !== null) return _live;
  try {
    const b = await fetch('/api/molecular/backends').then((r) => r.ok ? r.json() : null);
    _live = b && (b.local || b.nim) ? b : false;
  } catch { _live = false; }
  return _live;
}

export async function renderBiomolecules(el) {
  const live = await detectLive();
  const badge = live
    ? `<span class="chip allow">live · ${live.local ? 'local GPU' : 'NVIDIA NIM'}</span>`
    : `<span class="chip">demo · bundled samples</span>`;
  el.classList.add('stage');
  el.innerHTML = `
    <canvas id="bench-canvas" class="stage-canvas"></canvas>
    <div class="overlay stats">
      <div class="eyebrow">Biomolecules · test bench</div>
      <h3 id="bench-ch">—</h3>
      <div id="bench-cx" class="muted small"></div>
      <div id="bench-verdict" class="small" style="margin-top:.45rem">Generate a channel, then press <b>Test ▶</b> — the loop runs on the loaded brain.</div>
      <div class="muted small" style="margin-top:.55rem"><b>🔊</b> ultrasound writes → the real connectome responds → <b>🟢</b> neural dust reads (trace, bottom).</div>
    </div>
    <div class="overlay controls">
      <div class="eyebrow">Part 1 · De-novo channels ${badge}</div>
      <div class="seg" id="bio-view">
        <button class="seg-btn active" data-v="2d">2D bench</button>
        <button class="seg-btn" data-v="3d">3D brain</button>
      </div>
      <div class="zoom-row" id="bio-zoom">zoom
        <button class="zoom-btn" id="bio-zin" title="zoom in">＋</button>
        <button class="zoom-btn" id="bio-zout" title="zoom out">－</button>
        <button class="zoom-btn" id="bio-zreset" title="reset view">⤢</button>
        <span class="muted" style="text-transform:none">· or scroll</span>
      </div>
      <label class="field">modality
        <select id="mol-modality"><option>smiles</option><option>protein</option><option>dna</option></select></label>
      <label class="field">focus on
        <select id="mol-target">${TARGETS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>
      <label class="field">count <input id="mol-n" type="number" value="6" min="1" max="20"></label>
      <button class="btn" id="mol-gen">▶ Generate</button>
      <div id="mol-list" class="panel-card-list"><div class="muted small">Each molecule's sequence sets a channel — cation (excite) or anion (inhibit). Press Generate to design candidates.</div></div>
    </div>`;

  el.querySelector('#mol-gen').addEventListener('click', () => generate(el, live));

  // 2D bench (opaque, covers the 3D brain) ⇄ 3D brain (hide the bench to reveal it)
  _bioView = '2d';
  _view = { z: 1, x: 0, y: 0 };   // fresh view on panel open
  const canvas = el.querySelector('#bench-canvas');
  el.querySelector('#bio-view').addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn'); if (!btn) return;
    _bioView = btn.dataset.v;
    el.querySelectorAll('#bio-view .seg-btn').forEach((b) => b.classList.toggle('active', b === btn));
    canvas.style.display = _bioView === '2d' ? '' : 'none';
    el.querySelector('#bio-zoom').style.display = _bioView === '2d' ? '' : 'none';
    if (_bioView === '2d') idleBench(el);  // restore the idle connectome view
  });

  // zoom controls (2D bench only)
  el.querySelector('#bio-zin').addEventListener('click', () => _bench && _bench.zoomAt(1.25));
  el.querySelector('#bio-zout').addEventListener('click', () => _bench && _bench.zoomAt(1 / 1.25));
  el.querySelector('#bio-zreset').addEventListener('click', () => _bench && _bench.resetView());
  canvas.addEventListener('wheel', (e) => {
    if (!_bench || _bioView !== '2d') return;
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    _bench.zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  // show the loaded connectome in the centre straight away (idle), like the Brain template
  idleBench(el);
}

// mean activation across the live 3D BrainSim (for the "3D brain" test view)
function simMean() {
  const s = window.__sim; if (!s) return 0;
  let sum = 0; for (let i = 0; i < s.n; i++) sum += s.act[i];
  return s.n ? sum / s.n : 0;
}

// central canvas shows the current brain idling until a molecule is tested
function idleBench(el) {
  const data = window.__connectome;
  const canvas = el.querySelector('#bench-canvas');
  if (!data || !canvas) return;
  if (_bench) { captureView(_bench); _bench.stop(); }
  _bench = window.__bench = new TestBench(canvas, data,
    { sensitivity: 1, conductance: 1, sign: 1, target: '', locus: [0.5, 0.45] }, null, { interactive: true });
  requestAnimationFrame(() => { _bench.resize(); applyView(_bench); _bench.startLive(); });
}

async function generate(el, live) {
  const modality = el.querySelector('#mol-modality').value;
  const target = el.querySelector('#mol-target').value;
  const n = Math.max(1, Math.min(20, +el.querySelector('#mol-n').value || 6));
  const list = el.querySelector('#mol-list');
  list.innerHTML = `<div class="muted small">Generating…</div>`;

  let channels;
  if (live) {
    const res = await fetch('/api/molecular/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modality, n, target }),
    }).then((r) => r.json());
    channels = res.channels.map((ch) => ({ ...channelSpec(ch.sequence, ch.modality), ...ch, target }));
  } else {
    const s = await samples();
    const pool = s[modality] || s.smiles;
    channels = Array.from({ length: n }, (_, i) => {
      const seq = pool[i % pool.length];
      return { id: `${modality.slice(0, 3)}-${String(i).padStart(3, '0')}`, sequence: seq, modality, target, ...channelSpec(seq, modality) };
    });
  }

  list.innerHTML = channels.map((ch, i) => `<div class="mol-row" data-i="${i}"
      title="${ch.sequence} · sens ${ch.sensitivity.toFixed(2)} · g ${ch.conductance.toFixed(2)}">
    <b>${ch.id}</b>
    <span class="chip ${ch.sign > 0 ? 'ok' : 'no'}">${chanType(ch)}</span>
    <span class="mono">${ch.sequence}</span>
    <button class="btn act mol-test" data-i="${i}">Test ▶</button>
  </div>`).join('');

  list.querySelectorAll('.mol-test').forEach((btn) => btn.addEventListener('click', async () => {
    // always test on the CURRENTLY-loaded brain, even if you switched connectome after generating
    runBench(el, window.__connectome || await connectomeData(), channels[+btn.dataset.i]);
  }));
}

function runBench(el, data, ch) {
  el.querySelector('#bench-ch').textContent = `${ch.id} · ${chanType(ch)}`;
  const bn0 = data.n_neurons;
  el.querySelector('#bench-cx').textContent = `${data.name || 'connectome'} · sens ${ch.sensitivity.toFixed(2)} · g ${ch.conductance.toFixed(2)}`;
  const verdict = el.querySelector('#bench-verdict');

  // 3D-brain view: open the channel on the LIVE 3D sim and read the firing change from it.
  if (_bioView === '3d' && window.__sim) { runBench3d(el, ch, verdict); return; }

  if (_bench) { captureView(_bench); _bench.stop(); }
  verdict.innerHTML = '<span class="muted">running the BCI loop…</span>';
  const canvas = el.querySelector('#bench-canvas');

  _bench = window.__bench = new TestBench(canvas, data, ch, (r) => {
    const cls = r.direction === 'excited' ? 'ok' : (r.direction === 'suppressed' ? 'no' : 'muted');
    const verb = r.direction === 'excited' ? 'drove firing in the targeted neurons'
      : r.direction === 'suppressed' ? 'silenced the targeted neurons' : 'had little net effect';
    verdict.innerHTML = `<b class="chip ${cls}">${r.direction}</b> `
      + `<span class="muted small">${verb} · score ${r.score}</span>`;
  });
  // header reflects the bench's actual working set (large brains are subsampled for speed)
  const bn = _bench.data.n_neurons;
  if (bn < bn0) el.querySelector('#bench-cx').textContent += ` · ${bn0.toLocaleString()}→${bn.toLocaleString()} sampled`;
  // canvas needs a laid-out size before the bench measures it
  requestAnimationFrame(() => { _bench.resize(); applyView(_bench); _bench.start(); });
}

// 3D-brain view: open the channel on the LIVE 3D sim (same one the Brain template runs) and
// read the firing change straight off it — the real connectome lights up in the centre.
function runBench3d(el, ch, verdict) {
  const sim = window.__sim;
  if (_bench) _bench.stop();
  verdict.innerHTML = '<span class="muted">opening the channel on the 3D brain…</span>';
  const base = simMean();
  const amount = ch.sign * (3 + 4 * ch.sensitivity * ch.conductance);   // cation excites (+), anion inhibits (−)
  sim.stimulatePatch(0.14, amount);
  if (window.__ensureRunning) window.__ensureRunning();                 // step it so the effect propagates
  setTimeout(() => {
    const d = simMean() - base;
    const dir = d > 0.008 ? 'excited' : (d < -0.008 ? 'suppressed' : 'weak');
    const cls = dir === 'excited' ? 'ok' : (dir === 'suppressed' ? 'no' : 'muted');
    const verb = dir === 'excited' ? 'drove firing across the 3D connectome'
      : dir === 'suppressed' ? 'suppressed activity in the 3D connectome' : 'had little net effect';
    verdict.innerHTML = `<b class="chip ${cls}">${dir}</b> `
      + `<span class="muted small">${verb} · Δ ${d >= 0 ? '+' : ''}${d.toFixed(3)}</span>`;
  }, 800);
}
