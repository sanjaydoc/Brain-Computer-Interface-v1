// Waves panel — experiment with different waves on the real connectome.
// Aim (click the tissue) and fire a waveform (pulse · continuous · burst · chirp). A loaded
// biomolecule channel scales the wave by its sensitivity × conductance. "Combine sweep" fires
// waves across the tissue to cover the neurons a single focus misses (blind spots); the
// coverage read-out shows how many neurons the waves have reached. Runs on the live sim.

import { TestBench } from './testbench.js';
import { demoChannels, chanType } from './molecular.js';
import { WB } from './workbench.js';

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
    <div class="overlay stats" style="max-width:290px">
      <div class="eyebrow">Waves · coverage</div>
      <h3><span id="wv-cov">0%</span> reached</h3>
      <div class="statrow"><span>neurons reached</span><b id="wv-n">0</b></div>
      <div class="statrow"><span>blind spots</span><b id="wv-blind">—</b></div>
      <div class="statrow"><span>backscatter</span><b id="wv-back">—</b></div>
      <button class="btn" id="wv-reset" style="margin-top:.5rem">reset coverage</button>
      <div class="muted small">A single focus only reaches its focal spot — <b>combine waves</b> at different targets to cover the blind spots.</div>
    </div>
    <div class="overlay controls">
      <div class="eyebrow">〰️ waveform</div>
      <label class="field">wave
        <select id="wv-form"><option value="pulse">pulse</option><option value="continuous">continuous tone</option><option value="burst">burst train</option><option value="chirp">frequency chirp</option></select></label>
      <label class="field">channel (biomolecule)
        <select id="wv-chan"><option value="direct">— direct (no molecule) —</option></select></label>
      <label class="ctl">frequency <input id="wv-freq" type="range" min="0.3" max="2" step="0.1" value="1"><span id="wv-freq-v">1.0</span></label>
      <label class="ctl">pressure <input id="wv-press" type="range" min="1" max="7" step="0.5" value="5"><span id="wv-press-v">5</span></label>
      <label class="ctl">effect <select id="wv-sign"><option value="1">excite</option><option value="-1">inhibit</option></select></label>
      <button class="btn act" id="wv-fire">🔊 Fire wave at focus</button>
      <button class="btn act" id="wv-sweep">✳ Combine sweep — cover blind spots</button>
      <div class="muted small">Click the tissue to aim. Sweep fires the chosen wave across the whole connectome.</div>
    </div>`;

  const canvas = el.querySelector('#wv-canvas');
  const bindv = (id) => { const i = el.querySelector(`#wv-${id}`), o = el.querySelector(`#wv-${id}-v`); i.addEventListener('input', () => o.textContent = (+i.value).toFixed(1)); };
  bindv('freq'); bindv('press');
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
    chanSel.insertAdjacentHTML('beforeend', cs.map((c, i) => `<option value="${i}">${c.id} · ${chanType(c)} · s${c.sensitivity.toFixed(2)}·g${c.conductance.toFixed(2)}</option>`).join(''));
  });
  const params = () => {
    const form = el.querySelector('#wv-form').value, freq = +el.querySelector('#wv-freq').value, press = +el.querySelector('#wv-press').value;
    const ch = chanSel.value === 'direct' ? null : channels[+chanSel.value];
    const sign = ch ? ch.sign : +el.querySelector('#wv-sign').value;
    const gain = ch ? press * ch.sensitivity * ch.conductance : press;
    WB.wave = { form, freq, pressure: press, sign };
    return { form, freq, sign, gain };
  };

  canvas.addEventListener('click', (e) => { const r = canvas.getBoundingClientRect(); bench && bench.aimAt(e.clientX - r.left, e.clientY - r.top); });
  el.querySelector('#wv-fire').addEventListener('click', () => { if (!bench) return; const p = params(); bench.fireWave(p.sign, p.gain, p.form, p.freq); });
  el.querySelector('#wv-reset').addEventListener('click', () => bench && bench.clearCoverage());
  el.querySelector('#wv-sweep').addEventListener('click', () => {
    if (!bench) return; const p = params();
    // fire the chosen wave at a grid of foci across the tissue — each covers its own spot,
    // together they cover the blind spots a single focus leaves.
    const [x0, x1, y0, y1] = bench.bbox; let k = 0;
    for (let gx = 0; gx < 4; gx++) for (let gy = 0; gy < 3; gy++) {
      const fx = x0 + (gx + 0.5) / 4 * (x1 - x0), fy = y0 + (gy + 0.5) / 3 * (y1 - y0);
      setTimeout(() => { if (!bench) return; bench.aimAt(fx, fy); bench.fireWave(p.sign, p.gain, p.form, p.freq); }, k++ * 320);
    }
  });

  timer = setInterval(() => {
    if (!bench) return;
    const cov = bench.coverage(), n = Math.round(cov * bench.sim.n);
    el.querySelector('#wv-cov').textContent = `${Math.round(cov * 100)}%`;
    el.querySelector('#wv-n').textContent = n;
    el.querySelector('#wv-blind').textContent = bench.sim.n - n;
    const s = bench.liveStats(); el.querySelector('#wv-back').textContent = s.backscatter;
  }, 200);
}
