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
  return { sensitivity: sens, sign, conductance };
}

const chanType = (ch) => ch.sign > 0 ? 'cation · excite' : 'anion · inhibit';

let _data = null, _samples = null, _live = null, _bench = null;

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
  el.innerHTML = `<div class="panel-inner">
    <div class="eyebrow">Part 1 · Molecular engineering</div>
    <h2>Generate biomolecules → test on the connectome ${badge}</h2>
    <p style="max-width:70ch">De-novo channels from <a href="https://github.com/sanjaydoc/De-Novo-LLM">De-Novo-LLM</a>.
    Each molecule's <b>sequence sets a channel</b> — cation (excitatory) or anion (inhibitory),
    an ultrasound sensitivity, and a conductance (a transparent composition proxy, <i>not</i> a
    validated predictor). Press <b>Test</b> and the loop runs on the <b>currently-loaded brain</b>:
    ultrasound writes → the real connectome responds → neural dust reads.</p>
    <div class="mol-controls">
      <label>modality
        <select id="mol-modality"><option>smiles</option><option>protein</option><option>dna</option></select></label>
      <label>focus on
        <select id="mol-target">${TARGETS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>
      <label>count <input id="mol-n" type="number" value="6" min="1" max="20" style="width:4rem"></label>
      <button class="btn" id="mol-gen">▶ Generate</button>
    </div>
    <table id="mol-table"><thead><tr><th>channel</th><th>sequence</th><th>type</th><th>sens</th><th>g</th><th>test</th></tr></thead>
      <tbody><tr><td colspan="6" class="muted">Press Generate to design candidate channels.</td></tr></tbody></table>

    <section id="mol-bench" hidden>
      <div class="bench-head">
        <b>Test bench</b> · <span id="bench-cx" class="muted"></span> · channel <b id="bench-ch">—</b>
        <span id="bench-verdict"></span>
      </div>
      <canvas id="bench-canvas" class="bench-canvas"></canvas>
      <div class="muted small" style="margin-top:.4rem">
        <b>🔊 Sonogenetics ultrasound</b> (write): the beam focuses on a spot and opens the channel there.
        The <b>real connectome</b> responds and the activity propagates.
        <b>🟢 Neural dust</b> (read): motes record the evoked response (trace, bottom).
        This is the full BCI loop — <b>sequence → neural effect</b> — on the brain you have loaded.
      </div>
    </section>
  </div>`;

  el.querySelector('#mol-gen').addEventListener('click', () => generate(el, live));
}

async function generate(el, live) {
  const modality = el.querySelector('#mol-modality').value;
  const target = el.querySelector('#mol-target').value;
  const n = Math.max(1, Math.min(20, +el.querySelector('#mol-n').value || 6));
  const tbody = el.querySelector('#mol-table tbody');
  tbody.innerHTML = `<tr><td colspan="6" class="muted">Generating…</td></tr>`;

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

  tbody.innerHTML = channels.map((ch, i) => `<tr data-i="${i}">
    <td><b>${ch.id}</b></td>
    <td class="mono" style="font-size:.76rem;max-width:20ch;overflow:hidden;text-overflow:ellipsis">${ch.sequence}</td>
    <td><span class="chip ${ch.sign > 0 ? 'ok' : 'no'}">${chanType(ch)}</span></td>
    <td>${ch.sensitivity.toFixed(2)}</td>
    <td>${ch.conductance.toFixed(2)}</td>
    <td><button class="btn act mol-test" data-i="${i}">Test ▶</button></td>
  </tr>`).join('');

  const data = await connectomeData();
  tbody.querySelectorAll('.mol-test').forEach((btn) => btn.addEventListener('click', () => {
    runBench(el, data, channels[+btn.dataset.i]);
  }));
}

function runBench(el, data, ch) {
  if (_bench) _bench.stop();
  const bench = el.querySelector('#mol-bench');
  bench.hidden = false;
  el.querySelector('#bench-cx').textContent = `${data.name || 'connectome'} · ${data.n_neurons.toLocaleString()} neurons`;
  el.querySelector('#bench-ch').textContent = `${ch.id} (${chanType(ch)}, sens ${ch.sensitivity.toFixed(2)}, g ${ch.conductance.toFixed(2)})`;
  const verdict = el.querySelector('#bench-verdict');
  verdict.innerHTML = ' · <span class="muted">running…</span>';
  const canvas = el.querySelector('#bench-canvas');
  bench.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  _bench = window.__bench = new TestBench(canvas, data, ch, (r) => {
    const cls = r.direction === 'excited' ? 'ok' : (r.direction === 'suppressed' ? 'no' : 'muted');
    const verb = r.direction === 'excited' ? 'drove firing in the targeted neurons'
      : r.direction === 'suppressed' ? 'silenced the targeted neurons' : 'had little net effect';
    verdict.innerHTML = ` · <b class="chip ${cls}">${r.direction}</b> `
      + `<span class="muted small">${verb} · score ${r.score}</span>`;
  });
  // canvas needs a laid-out size before the bench measures it
  requestAnimationFrame(() => { _bench.resize(); _bench.start(); });
}
