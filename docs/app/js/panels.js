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
      <label class="field">channel
        <select id="sc-chan"><option value="direct">— direct (no molecule) —</option></select></label>
      <label class="field">effect
        <select id="sc-sign"><option value="1">excite (cation)</option><option value="-1">inhibit (anion)</option></select></label>
      <label class="ctl">pressure <input id="sc-gain" type="range" min="1" max="7" step="0.5" value="5"><span id="sc-gain-v">5</span></label>
      <button class="btn act" id="sc-pulse">🔊 Deliver ultrasound pulse</button>
      <div class="muted small">Click the tissue to aim the focus. A molecule scales the same pulse by its <b>sensitivity × conductance</b>, so each one lands differently.</div>
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
    if (!scanBench) return;
    const r = canvas.getBoundingClientRect();
    scanBench.aimAt(e.clientX - r.left, e.clientY - r.top);
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
    if (!scanBench) return;
    const pressure = +el.querySelector('#sc-gain').value;
    const ch = chanSel.value === 'direct' ? null : channels[+chanSel.value];
    // a molecule scales the SAME pressure by its channel sensitivity × conductance; direct mode
    // drives the ultrasound raw (sensitivity = conductance = 1).
    if (ch) scanBench.firePulse(ch.sign, pressure * ch.sensitivity * ch.conductance);
    else scanBench.firePulse(+signSel.value, pressure);
  });
  liveTimer = setInterval(() => {
    if (!scanBench) return;
    const s = scanBench.liveStats();
    el.querySelector('#sc-firing').textContent = s.motesActive;
    el.querySelector('#sc-mean').textContent = s.backscatter;
    el.querySelector('#sc-now').textContent = s.readout.toFixed(3);
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
