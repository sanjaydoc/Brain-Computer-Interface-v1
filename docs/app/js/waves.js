// Waves panel — target neurons with different WAVE MODALITIES on the real connectome.
// Every wave shares amplitude, wavelength (λ) and frequency (f), tied by speed = f·λ. What
// differs between modalities is the frequency BAND — which sets how deep it reaches and how
// tightly it focuses. Ultrasound alone leaves blind spots (only its focal spot); combining
// modalities across the acoustic + electromagnetic spectrum covers them. A loaded biomolecule
// channel scales any wave by its sensitivity × conductance. Runs on the live sim.

import { TestBench } from './testbench.js';
import { demoChannels, chanType } from './molecular.js';
import { WB } from './workbench.js';

// speed of the medium: sound in tissue ≈ 1540 m/s, EM ≈ 3e8 m/s. λ = v / f.
const C_EM = 3e8, C_SND = 1540, C_AIR = 340;
// modality → (band, frequency, wave speed, tissue reach, coverage fraction, colour). The reach
// model is the physical intuition made visible: focused ultrasound is deep+small, MRI/gamma
// penetrate the whole volume, optical/IR only see the surface, X-ray cuts a penetrating band.
export const MODES = [
  { id: 'ultrasound', label: 'Ultrasound (focused)', kind: 'acoustic', f: 1e6, v: C_SND, reach: 'focal', frac: 0.10, note: 'deep but a tiny focal spot' },
  { id: 'infrasound', label: 'Infrasound', kind: 'acoustic', f: 12, v: C_AIR, reach: 'volume', frac: 0.22, note: 'broad, weak, diffuse' },
  { id: 'radio', label: 'Radio waves (MRI)', kind: 'electromagnetic', f: 64e6, v: C_EM, reach: 'volume', frac: 0.5, note: 'penetrates the whole volume' },
  { id: 'microwave', label: 'Microwave', kind: 'electromagnetic', f: 2.4e9, v: C_EM, reach: 'focal', frac: 0.18, note: 'medium depth, warms tissue' },
  { id: 'infrared', label: 'Infrared / optical (fNIRS)', kind: 'electromagnetic', f: 3.7e14, v: C_EM, reach: 'surface', frac: 0.20, note: 'cortical surface only — blind to depth' },
  { id: 'xray', label: 'X-rays', kind: 'electromagnetic', f: 3e18, v: C_EM, reach: 'column', frac: 0.15, note: 'a penetrating band (CT)' },
  { id: 'gamma', label: 'Gamma rays (PET)', kind: 'electromagnetic', f: 1e20, v: C_EM, reach: 'volume', frac: 0.6, note: 'whole-volume, functional/metabolic' },
];
// a complementary set that together covers deep + surface + whole-volume → no blind spots
const SPECTRUM = ['ultrasound', 'infrared', 'radio'];

const eng = (x, unit) => {   // human-readable engineering notation
  const p = [[1e21, 'Z'], [1e18, 'E'], [1e15, 'P'], [1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
  for (const [m, s] of p) if (Math.abs(x) >= m) return `${(x / m).toFixed(x / m < 10 ? 1 : 0)} ${s}${unit}`;
  return `${x.toExponential(1)} ${unit}`;
};

let bench = null, timer = null;
export function stopWaves() {
  if (bench) { bench.stop(); bench = null; }
  if (timer) { clearInterval(timer); timer = null; }
}

export function renderWaves(el) {
  const data = window.__connectome;
  el.classList.add('stage');
  const modeRows = MODES.map((m) => `<label class="wv-mode-row"><input type="checkbox" data-id="${m.id}" ${SPECTRUM.includes(m.id) ? 'checked' : ''}>
    <b>${m.label.split(' (')[0]}</b><span class="muted">${eng(m.f, 'Hz')} · ${m.reach}</span></label>`).join('');

  el.innerHTML = `
    <canvas id="wv-canvas" class="stage-canvas" style="cursor:crosshair"></canvas>
    <div class="overlay stats" style="max-width:300px">
      <div class="eyebrow">Waves · spectrum coverage</div>
      <h3><span id="wv-cov">0%</span> reached</h3>
      <div class="statrow"><span>neurons reached</span><b id="wv-n">0</b></div>
      <div class="statrow"><span>blind spots</span><b id="wv-blind">—</b></div>
      <button class="btn" id="wv-reset" style="margin-top:.4rem">reset coverage</button>
      <hr class="divider" style="margin:.55rem 0 .4rem">
      <div class="eyebrow" style="margin-bottom:.2rem">invented waves</div>
      <div class="panel-card-list" id="wv-saved" style="max-height:24vh"></div>
      <div class="muted small">Ultrasound alone leaves blind spots — combine modalities into a new wave, then <b>test it in Scanner</b>.</div>
    </div>
    <div class="overlay controls">
      <div class="eyebrow">〰️ invent a wave</div>
      <div class="muted small" style="margin:-.1rem 0 .1rem">combine modalities across the spectrum:</div>
      <div class="wv-modes">${modeRows}</div>
      <label class="field">channel (biomolecule)
        <select id="wv-chan"><option value="direct">— direct (no molecule) —</option></select></label>
      <label class="ctl">amplitude <input id="wv-amp" type="range" min="1" max="8" step="0.5" value="5"><span id="wv-amp-v">5</span></label>
      <label class="ctl">effect <select id="wv-sign"><option value="1">excite</option><option value="-1">inhibit</option></select></label>
      <button class="btn act" id="wv-fire">🔊 Fire selected combination</button>
      <label class="field">name
        <input id="wv-name" type="text" placeholder="e.g. TriBand-1" style="text-transform:none"></label>
      <button class="btn act" id="wv-invent">💾 Invent this wave</button>
      <div class="muted small" id="wv-note">Click the tissue to aim, fire the combination, then save it. Every wave has amplitude · λ · f (v = f·λ); the band sets its reach.</div>
    </div>`;

  const canvas = el.querySelector('#wv-canvas');
  el.querySelector('#wv-amp').addEventListener('input', (e) => el.querySelector('#wv-amp-v').textContent = e.target.value);
  if (!data) { canvas.style.display = 'none'; return; }

  requestAnimationFrame(() => {
    bench = window.__waveBench = new TestBench(canvas, data,
      { sensitivity: 1, conductance: 1, sign: 1, target: '', locus: [0.5, 0.45] }, null, { interactive: true });
    bench.startCoverage();
    bench.startLive();
  });

  let channels = [];
  const chanSel = el.querySelector('#wv-chan');
  demoChannels('smiles', 4).then((cs) => {
    channels = cs;
    chanSel.insertAdjacentHTML('beforeend', cs.map((c, i) => `<option value="${i}">${c.id} · ${chanType(c)}</option>`).join(''));
  });

  const selectedModes = () => [...el.querySelectorAll('.wv-mode-row input:checked')].map((cb) => MODES.find((m) => m.id === cb.dataset.id)).filter(Boolean);

  const fireMode = (m) => {
    if (!bench) return;
    const amp = +el.querySelector('#wv-amp').value;
    const ch = chanSel.value === 'direct' ? null : channels[+chanSel.value];
    const sign = ch ? ch.sign : +el.querySelector('#wv-sign').value;
    const gain = ch ? amp * ch.sensitivity * ch.conductance : amp;
    bench.setReach(m.reach, m.frac);
    bench.fireWave(sign, gain, m.reach === 'focal' ? 'pulse' : 'continuous', 1);
  };
  const fireCombo = () => { const ms = selectedModes(); ms.forEach((m, k) => setTimeout(() => fireMode(m), k * 750)); };

  const renderSaved = () => {
    const box = el.querySelector('#wv-saved');
    box.innerHTML = WB.waves.length
      ? WB.waves.map((w) => `<div class="mol-row"><b>${w.name}</b><span class="mono">${w.modes.length} modes</span><span class="chip ${w.coverage >= 0.8 ? 'ok' : ''}">${Math.round(w.coverage * 100)}%</span></div>`).join('')
      : '<div class="muted small">None yet — invent one below.</div>';
  };
  renderSaved();

  const invent = () => {
    const ms = selectedModes(); if (!ms.length) return;
    const name = el.querySelector('#wv-name').value.trim() || `Wave-${WB.waves.length + 1}`;
    const w = { name, modes: ms.map((m) => m.id), amplitude: +el.querySelector('#wv-amp').value,
      sign: +el.querySelector('#wv-sign').value, coverage: bench ? +bench.coverage().toFixed(2) : 0 };
    WB.waves.push(w); WB.wave = w;
    el.querySelector('#wv-name').value = '';
    renderSaved();
    el.querySelector('#wv-note').innerHTML = `Saved <b>${name}</b> (${ms.length} modalities, ${Math.round(w.coverage * 100)}% coverage) → now open <b>Scanner</b> to test it on a connectome.`;
  };

  canvas.addEventListener('click', (e) => { const r = canvas.getBoundingClientRect(); bench && bench.aimAt(e.clientX - r.left, e.clientY - r.top); });
  canvas.addEventListener('wheel', (e) => {   // mouse-scroll zoom toward the cursor
    if (!bench) return;
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    bench.zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  el.querySelector('#wv-fire').addEventListener('click', fireCombo);
  el.querySelector('#wv-invent').addEventListener('click', invent);
  el.querySelector('#wv-reset').addEventListener('click', () => bench && bench.clearCoverage());

  timer = setInterval(() => {
    if (!bench) return;
    const cov = bench.coverage(), n = Math.round(cov * bench.sim.n);
    el.querySelector('#wv-cov').textContent = `${Math.round(cov * 100)}%`;
    el.querySelector('#wv-n').textContent = n;
    el.querySelector('#wv-blind').textContent = bench.sim.n - n;
  }, 200);
}
