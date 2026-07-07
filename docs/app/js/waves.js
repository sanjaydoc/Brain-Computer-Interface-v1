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

// rule-based inventor (demo mode) — a faithful JS mirror of backend/bci/waves/inventor.py
function nameFrom(goal) {
  const w = (goal || '').replace(/[^a-z0-9 ]/gi, ' ').split(/\s+/).filter((x) => x.length > 2);
  return (w.slice(0, 2).map((s) => s[0].toUpperCase() + s.slice(1)).join('') || 'Invented') + '-Wave';
}
function composeWaveJS(goal) {
  const t = (goal || '').toLowerCase(), want = (...ks) => ks.some((k) => t.includes(k));
  let modes = [];
  if (want('deep', 'subcortical', 'thalam', 'whole', 'entire', 'map', 'all')) modes.push('ultrasound', 'radio');
  if (want('surface', 'cortical', 'cortex', 'optical', 'fnirs', 'scalp')) modes.push('infrared');
  if (want('functional', 'metabolic', 'activity', 'pet', 'blood')) modes.push('gamma');
  if (want('bone', 'skull', 'structural', 'ct', 'dense')) modes.push('xray');
  if (want('broad', 'diffuse', 'field', 'wide')) modes.push('infrasound');
  if (!modes.length) modes = ['ultrasound', 'infrared', 'radio'];
  modes = [...new Set(modes)].slice(0, 4);
  const waveform = want('scan', 'sweep', 'image') ? 'chirp' : want('stimulate', 'drive') ? 'burst'
    : want('monitor', 'continuous', 'record', 'read') ? 'continuous' : 'pulse';
  return { name: nameFrom(goal), modes, waveform, freq: 1.0, amplitude: 5, sign: 1,
    rationale: `Combines ${modes.join(', ')} so their reaches cover deep, surface and whole-volume tissue.`, backend: 'demo' };
}

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
      <label class="field">✨ invention prompt
        <input id="wv-goal" type="text" placeholder="e.g. map the whole cortex with no blind spots" style="text-transform:none"></label>
      <button class="btn" id="wv-ai" style="margin-bottom:.35rem">✨ Invent from prompt</button>
      <div class="muted small" style="margin:-.1rem 0 .15rem">1 · combine modalities across the spectrum:</div>
      <div class="wv-modes">${modeRows}</div>
      <div class="muted small" style="margin:.15rem 0 .1rem">2 · shape the waveform:</div>
      <canvas id="wv-preview" class="wv-preview"></canvas>
      <label class="field">waveform
        <select id="wv-form"><option value="pulse">pulse</option><option value="continuous">continuous tone</option><option value="burst">burst train</option><option value="chirp">frequency chirp (sweep)</option></select></label>
      <label class="ctl">modulation f <input id="wv-freq" type="range" min="0.3" max="2" step="0.1" value="1"><span id="wv-freq-v">1.0</span></label>
      <label class="ctl">amplitude <input id="wv-amp" type="range" min="1" max="8" step="0.5" value="5"><span id="wv-amp-v">5</span></label>
      <label class="ctl">effect <select id="wv-sign"><option value="1">excite</option><option value="-1">inhibit</option></select></label>
      <label class="field">channel (biomolecule)
        <select id="wv-chan"><option value="direct">— direct (no molecule) —</option></select></label>
      <button class="btn act" id="wv-fire">🔊 Fire selected combination</button>
      <label class="field">3 · name your wave
        <input id="wv-name" type="text" placeholder="e.g. TriBand-1" style="text-transform:none"></label>
      <button class="btn act" id="wv-invent">💾 Invent this wave</button>
      <div class="muted small" id="wv-note">Pick modalities + a waveform, aim (click the tissue), fire, then save. Every wave has amplitude · λ · f (v = f·λ); the band sets its reach.</div>
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

  // waveform preview — draw the chosen envelope shape so "inventing" is visible
  const envAt = (form, t, freq) => {
    if (form === 'continuous') return Math.min(1, t / 8) * Math.min(1, (96 - t) / 8);
    if (form === 'burst') return (Math.floor(t / 12) % 2 === 0) ? Math.sin(((t % 12) / 12) * Math.PI) : 0;
    if (form === 'chirp') return Math.abs(Math.sin(t * (0.12 + freq * t * 0.004)));
    return t < 34 ? Math.sin((t / 34) * Math.PI) : 0;   // pulse
  };
  const pv = el.querySelector('#wv-preview'), pctx = pv.getContext('2d');
  const drawPreview = () => {
    const form = el.querySelector('#wv-form').value, freq = +el.querySelector('#wv-freq').value;
    const r = pv.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
    pv.width = r.width * d; pv.height = r.height * d; pctx.setTransform(d, 0, 0, d, 0, 0);
    const W = r.width, H = r.height;
    pctx.clearRect(0, 0, W, H);
    pctx.strokeStyle = 'rgba(0,0,0,.08)'; pctx.beginPath(); pctx.moveTo(0, H / 2); pctx.lineTo(W, H / 2); pctx.stroke();
    pctx.beginPath();
    for (let i = 0; i <= 96; i++) { const y = H - 4 - envAt(form, i, freq) * (H - 8); pctx[i === 0 ? 'moveTo' : 'lineTo'](4 + i / 96 * (W - 8), y); }
    pctx.strokeStyle = '#2f6fed'; pctx.lineWidth = 1.6; pctx.stroke();
  };
  el.querySelector('#wv-freq').addEventListener('input', (e) => { el.querySelector('#wv-freq-v').textContent = (+e.target.value).toFixed(1); drawPreview(); });
  el.querySelector('#wv-form').addEventListener('change', drawPreview);
  requestAnimationFrame(drawPreview);

  const fireMode = (m) => {
    if (!bench) return;
    const amp = +el.querySelector('#wv-amp').value;
    const ch = chanSel.value === 'direct' ? null : channels[+chanSel.value];
    const sign = ch ? ch.sign : +el.querySelector('#wv-sign').value;
    const gain = ch ? amp * ch.sensitivity * ch.conductance : amp;
    bench.setReach(m.reach, m.frac);
    bench.fireWave(sign, gain, el.querySelector('#wv-form').value, +el.querySelector('#wv-freq').value);
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
    const w = { name, modes: ms.map((m) => m.id), waveform: el.querySelector('#wv-form').value,
      freq: +el.querySelector('#wv-freq').value, amplitude: +el.querySelector('#wv-amp').value,
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
  // ✨ invent from a goal — live: the LLM engine (/api/waves/invent, NVIDIA NIM / local /
  // OpenAI); demo: the in-browser rule-based inventor. Applies the design to the controls.
  const applyInvention = (w) => {
    el.querySelectorAll('.wv-mode-row input').forEach((cb) => { cb.checked = w.modes.includes(cb.dataset.id); });
    el.querySelector('#wv-form').value = w.waveform || 'pulse';
    el.querySelector('#wv-freq').value = w.freq || 1; el.querySelector('#wv-freq-v').textContent = (+(w.freq || 1)).toFixed(1);
    el.querySelector('#wv-amp').value = w.amplitude || 5; el.querySelector('#wv-amp-v').textContent = w.amplitude || 5;
    el.querySelector('#wv-sign').value = String(w.sign || 1);
    el.querySelector('#wv-name').value = w.name || '';
    drawPreview();
    el.querySelector('#wv-note').innerHTML = `✨ <b>${w.name}</b>: ${w.rationale || ''} `
      + `<span class="muted">(${w.backend || 'demo'}${w.provider ? ' · ' + w.provider : ''})</span> — now Fire the combination, then <b>Invent this wave</b> to save.`;
  };
  el.querySelector('#wv-ai').addEventListener('click', async () => {
    const goal = el.querySelector('#wv-goal').value.trim(); if (!goal) return;
    el.querySelector('#wv-note').textContent = 'Inventing…';
    let w;
    try {
      const r = await fetch('/api/waves/invent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ goal }) });
      w = r.ok ? await r.json() : composeWaveJS(goal);
    } catch { w = composeWaveJS(goal); }
    applyInvention(w);
  });

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
