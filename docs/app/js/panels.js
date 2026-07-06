// Control-plane tab panels. Brain template = live 3D viewer. Biomolecules, Scanner and
// System are interactive (they drive / read the same running BrainSim, window.__sim).
// Virtual env is an info panel (the worm is live in the Brain template).

import { renderBiomolecules } from './molecular.js';

const VENV = `
  <div class="panel-inner">
    <div class="eyebrow">Part 4 · Virtual environment</div>
    <h2>The simulated world</h2>
    <p style="max-width:64ch">The engine runs one authoritative loop —
    <b>read (dust) → step → write (sono) → publish</b> — over the living twin. Locomotion is
    <b>decoded live from the command neurons</b>; the crawling worm in the Brain template is
    driven by it, with no scripted motion.</p>
    <div class="pgrid">
      <div class="card"><div class="label">Neuron model</div><b>LIF</b><p class="muted">→ Hodgkin–Huxley (same interface)</p></div>
      <div class="card"><div class="label">Stepper</div><b>sparse matvec (CPU)</b><p class="muted">→ GPU / distributed</p></div>
      <div class="card"><div class="label">Environment</div><b>stimulus_protocol</b><p class="muted">universal · worm→human</p></div>
    </div>
    <p class="muted">Open <b>Brain template</b> and press ▶ Run — drive AVB (forward) or AVA
    (reverse). The behaviour emerges from simulating the connectome.</p>
  </div>`;

const TARGETS = [['rev', 'reverse cmd (AVA)'], ['fwd', 'forward cmd (AVB)'],
  ['touchPost', 'posterior touch (PLM)'], ['touchAnt', 'anterior touch (ALM/AVM)']];

let liveTimer = null;
function stopLive() { if (liveTimer) { clearInterval(liveTimer); liveTimer = null; } }

function renderScanner(el) {
  el.innerHTML = `<div class="panel-inner">
    <div class="eyebrow">Part 2 · Electronics &amp; hardware</div>
    <h2>Ultrasound scanner — read &amp; write</h2>
    <p style="max-width:64ch">Two live subsystems over the running brain. Effects appear in
    the <b>Brain template</b> view. v1 uses simulated adapters behind the real
    <code>NeuralInput</code>/<code>NeuralOutput</code> contracts.</p>
    <div class="pgrid">
      <div class="card">
        <span class="chip allow">WRITE</span><b style="margin-left:.4rem">Sonogenetics</b>
        <label class="ctl" style="margin-top:.6rem">focus
          <select id="sc-target">${TARGETS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>
        <label class="ctl">gain <input id="sc-gain" type="range" min="1" max="6" step="0.5" value="3.4"><span id="sc-gain-v">3.4</span></label>
        <button class="btn" id="sc-pulse" style="margin-top:.5rem">🔊 Deliver ultrasound pulse</button>
      </div>
      <div class="card">
        <span class="chip allow">READ</span><b style="margin-left:.4rem">Neural dust</b>
        <div class="statrow"><span>active motes</span><b id="sc-firing">—</b></div>
        <div class="statrow"><span>mean backscatter</span><b id="sc-mean">—</b></div>
        <div class="statrow"><span>decoded locomotion</span><b id="sc-loco">—</b></div>
        <div class="muted small">1 mote / neuron (idealized) · updates live</div>
      </div>
    </div>
  </div>`;
  el.querySelector('#sc-gain').addEventListener('input', (e) => { el.querySelector('#sc-gain-v').textContent = e.target.value; });
  el.querySelector('#sc-pulse').addEventListener('click', () => {
    const s = window.__sim; if (!s) return;
    s.stimulateRole(el.querySelector('#sc-target').value, +el.querySelector('#sc-gain').value);
  });
  liveTimer = setInterval(() => {
    const s = window.__sim; if (!s) return;
    let f = 0, m = 0; for (let i = 0; i < s.n; i++) { if (s.act[i] > 0.1) f++; m += s.act[i]; }
    el.querySelector('#sc-firing').textContent = f;
    el.querySelector('#sc-mean').textContent = (m / s.n).toFixed(3);
    const loco = s.locomotion();
    el.querySelector('#sc-loco').textContent = `${loco >= 0 ? '+' : ''}${loco.toFixed(3)} (${loco < -0.02 ? 'reverse' : loco > 0.02 ? 'forward' : 'idle'})`;
  }, 150);
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
        <tr><td>C. elegans</td><td>302</td><td>~7,000</td><td><span class="chip allow">real</span></td></tr>
        <tr><td>MICrONS mouse</td><td>~200,000</td><td>~500,000,000</td><td><span class="chip allow">real</span></td></tr>
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

const panel = document.getElementById('panel');
const tabs = [...document.querySelectorAll('.tab')];
tabs.forEach((t) => t.addEventListener('click', () => {
  tabs.forEach((x) => x.classList.toggle('active', x === t));
  stopLive();
  const key = t.dataset.tab;
  if (key === 'brain') { panel.hidden = true; panel.innerHTML = ''; return; }
  panel.hidden = false;
  if (key === 'biomolecules') renderBiomolecules(panel);
  else if (key === 'scanner') renderScanner(panel);
  else if (key === 'system') renderSystem(panel);
  else panel.innerHTML = VENV;
}));
