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
const MODES = [
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
  const p = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
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
  el.innerHTML = `
    <canvas id="wv-canvas" class="stage-canvas" style="cursor:crosshair"></canvas>
    <div class="overlay stats" style="max-width:300px">
      <div class="eyebrow">Waves · spectrum coverage</div>
      <h3><span id="wv-cov">0%</span> reached</h3>
      <div class="statrow"><span>neurons reached</span><b id="wv-n">0</b></div>
      <div class="statrow"><span>blind spots</span><b id="wv-blind">—</b></div>
      <hr class="divider" style="margin:.4rem 0">
      <div class="statrow"><span>frequency f</span><b id="wv-f">—</b></div>
      <div class="statrow"><span>wavelength λ</span><b id="wv-lambda">—</b></div>
      <div class="statrow"><span>reach</span><b id="wv-reach">—</b></div>
      <button class="btn" id="wv-reset" style="margin-top:.5rem">reset coverage</button>
      <div class="muted small">One modality only reaches its own tissue — <b>combine the spectrum</b> to cover the blind spots (ultrasound can't map the whole brain).</div>
    </div>
    <div class="overlay controls">
      <div class="eyebrow">〰️ wave modality</div>
      <label class="field">wave
        <select id="wv-mode">
          <optgroup label="acoustic (mechanical)">${MODES.filter((m) => m.kind === 'acoustic').map((m) => `<option value="${m.id}">${m.label}</option>`).join('')}</optgroup>
          <optgroup label="electromagnetic">${MODES.filter((m) => m.kind === 'electromagnetic').map((m) => `<option value="${m.id}">${m.label}</option>`).join('')}</optgroup>
        </select></label>
      <label class="field">channel (biomolecule)
        <select id="wv-chan"><option value="direct">— direct (no molecule) —</option></select></label>
      <label class="ctl">amplitude <input id="wv-amp" type="range" min="1" max="8" step="0.5" value="5"><span id="wv-amp-v">5</span></label>
      <label class="ctl">effect <select id="wv-sign"><option value="1">excite</option><option value="-1">inhibit</option></select></label>
      <button class="btn act" id="wv-fire">🔊 Fire wave at focus</button>
      <button class="btn act" id="wv-combine">✳ Combine spectrum — cover blind spots</button>
      <div class="muted small" id="wv-note">Click the tissue to aim. Every wave has amplitude · λ · f (v = f·λ); the band sets its reach.</div>
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

  const mode = () => MODES.find((m) => m.id === el.querySelector('#wv-mode').value) || MODES[0];
  const showMode = () => {
    const m = mode(), lam = m.v / m.f;
    el.querySelector('#wv-f').textContent = eng(m.f, 'Hz');
    el.querySelector('#wv-lambda').textContent = eng(lam, 'm');
    el.querySelector('#wv-reach').textContent = `${m.reach} · ${m.note}`;
    el.querySelector('#wv-note').innerHTML = `<b>${m.label}</b>: ${m.note}. λ = v/f = ${eng(lam, 'm')} · reaches the <b>${m.reach}</b>.`;
  };
  el.querySelector('#wv-mode').addEventListener('change', showMode);
  showMode();

  const fireMode = (m) => {
    if (!bench) return;
    const amp = +el.querySelector('#wv-amp').value;
    const ch = chanSel.value === 'direct' ? null : channels[+chanSel.value];
    const sign = ch ? ch.sign : +el.querySelector('#wv-sign').value;
    const gain = ch ? amp * ch.sensitivity * ch.conductance : amp;
    WB.wave = { form: m.id, freq: m.f, pressure: amp, sign };
    bench.setReach(m.reach, m.frac);
    bench.fireWave(sign, gain, m.reach === 'focal' ? 'pulse' : 'continuous', 1);
  };

  canvas.addEventListener('click', (e) => { const r = canvas.getBoundingClientRect(); bench && bench.aimAt(e.clientX - r.left, e.clientY - r.top); });
  el.querySelector('#wv-fire').addEventListener('click', () => fireMode(mode()));
  el.querySelector('#wv-reset').addEventListener('click', () => bench && bench.clearCoverage());
  el.querySelector('#wv-combine').addEventListener('click', () => {
    // fire the complementary spectrum set (deep focal + surface + whole-volume) in sequence —
    // each covers a different tissue, together they leave no blind spots.
    SPECTRUM.forEach((id, k) => setTimeout(() => fireMode(MODES.find((m) => m.id === id)), k * 900));
  });

  timer = setInterval(() => {
    if (!bench) return;
    const cov = bench.coverage(), n = Math.round(cov * bench.sim.n);
    el.querySelector('#wv-cov').textContent = `${Math.round(cov * 100)}%`;
    el.querySelector('#wv-n').textContent = n;
    el.querySelector('#wv-blind').textContent = bench.sim.n - n;
  }, 200);
}
