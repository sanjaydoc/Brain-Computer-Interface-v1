// Biomolecules panel (Part 1) — Generate → Test on connectome.
// Live mode: calls the backend API (real De-Novo-LLM / NVIDIA NIM). Demo mode (hosted,
// no backend): bundled samples + a browser assay using the same BrainSim. Two buttons.

import { BrainSim } from './sim.js';

const TARGETS = [
  ['rev', 'reverse command (AVA) → reversal'],
  ['fwd', 'forward command (AVB) → forward'],
  ['touchPost', 'posterior touch (PLM)'],
];
const HYDRO = new Set('AILMFWVY');

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

// browser assay: fresh sim, warm up, ultrasound-write to target × sensitivity, measure.
function browserAssay(data, target, sens) {
  const s = new BrainSim(data);
  for (let k = 0; k < 120; k++) s.step();
  const base = s.locomotion();
  s.stimulateRole(target, 2.2 * sens);
  let peak = 0, lp = 0;
  for (let k = 0; k < 80; k++) {
    s.step();
    let f = 0; for (let i = 0; i < s.n; i++) if (s.act[i] > 0.1) f++;
    peak = Math.max(peak, f);
    const d = s.locomotion() - base;
    if (Math.abs(d) > Math.abs(lp)) lp = d;
  }
  return { peak_firing: peak, loco_response: +lp.toFixed(3),
    direction: lp < -0.05 ? 'reverse' : (lp > 0.05 ? 'forward' : 'weak'),
    score: +Math.min(1, Math.abs(lp) / 2).toFixed(3) };
}

let _data = null, _samples = null, _live = null;

async function connectomeData() {
  if (window.__connectome) return window.__connectome;
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
    <p style="max-width:66ch">De-novo channels from <a href="https://github.com/sanjaydoc/De-Novo-LLM">De-Novo-LLM</a>.
    Each generated molecule becomes a <b>sonogenetic channel</b> with a modeled ultrasound
    sensitivity (a transparent composition proxy — not a validated predictor). Test it and the
    <b>real connectome simulation</b> responds.</p>
    <div class="mol-controls">
      <label>modality
        <select id="mol-modality"><option>smiles</option><option>protein</option><option>dna</option></select></label>
      <label>express in
        <select id="mol-target">${TARGETS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>
      <label>count <input id="mol-n" type="number" value="6" min="1" max="20" style="width:4rem"></label>
      <button class="btn" id="mol-gen">▶ Generate</button>
    </div>
    <table id="mol-table"><thead><tr><th>channel</th><th>sequence</th><th>sensitivity</th><th>test → response</th></tr></thead>
      <tbody><tr><td colspan="4" class="muted">Press Generate to design candidate channels.</td></tr></tbody></table>
  </div>`;

  el.querySelector('#mol-gen').addEventListener('click', () => generate(el, live));
}

async function generate(el, live) {
  const modality = el.querySelector('#mol-modality').value;
  const target = el.querySelector('#mol-target').value;
  const n = Math.max(1, Math.min(20, +el.querySelector('#mol-n').value || 6));
  const tbody = el.querySelector('#mol-table tbody');
  tbody.innerHTML = `<tr><td colspan="4" class="muted">Generating…</td></tr>`;

  let channels;
  if (live) {
    const res = await fetch('/api/molecular/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modality, n, target }),
    }).then((r) => r.json());
    channels = res.channels;
  } else {
    const s = await samples();
    const pool = s[modality] || s.smiles;
    channels = Array.from({ length: n }, (_, i) => {
      const seq = pool[i % pool.length];
      return { id: `${modality.slice(0, 3)}-${String(i).padStart(3, '0')}`, sequence: seq,
        modality, sensitivity: sensitivity(seq, modality), target };
    });
  }

  tbody.innerHTML = channels.map((ch, i) => `<tr data-i="${i}">
    <td><b>${ch.id}</b></td>
    <td class="mono" style="font-size:.78rem;max-width:22ch;overflow:hidden;text-overflow:ellipsis">${ch.sequence}</td>
    <td>${ch.sensitivity.toFixed(2)}</td>
    <td><button class="btn act mol-test" data-i="${i}">Test ▶</button> <span class="mol-res muted"></span></td>
  </tr>`).join('');

  const data = await connectomeData();
  tbody.querySelectorAll('.mol-test').forEach((btn) => btn.addEventListener('click', async () => {
    const ch = channels[+btn.dataset.i];
    const cell = btn.parentElement.querySelector('.mol-res');
    cell.textContent = '…';
    let r;
    if (live) {
      r = await fetch('/api/molecular/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sequence: ch.sequence, modality: ch.modality, sensitivity: ch.sensitivity, target: ch.target }),
      }).then((x) => x.json());
    } else {
      r = browserAssay(data, ch.target, ch.sensitivity);
    }
    const cls = r.direction === 'reverse' ? 'no' : (r.direction === 'forward' ? 'ok' : 'muted');
    cell.innerHTML = `<b style="color:var(--${cls === 'muted' ? 'muted' : cls})">${r.direction}</b> · loco ${r.loco_response} · ${r.peak_firing} firing · score ${r.score}`;
  }));
}
