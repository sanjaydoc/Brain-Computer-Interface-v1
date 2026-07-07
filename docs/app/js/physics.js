// Biophysics panel — defines the biophysical model the 2D & 3D connectomes run on, shown live
// on a minimal 2-neuron circuit (PRE → synapse → POST): molecular interaction (sequence →
// channel), membrane permeability (leak), excitation & inhibition potentials, and the
// interaction of waves with neurons (ultrasound opens the channel → PRE spikes → the synapse
// carries the sign → POST is excited or inhibited). The parameter sliders are the same
// biophysics the connectome sim uses, so changing them here changes the whole simulation.

import { channelSpec, chanType } from './molecular.js';
import { WB } from './workbench.js';

const VTH = 1.0, DT = 1;

export function renderPhysics(el) {
  el.classList.add('stage');
  el.innerHTML = `
    <canvas id="phys-canvas" class="stage-canvas"></canvas>
    <div class="overlay stats" style="max-width:300px">
      <div class="eyebrow">Biophysics · molecular interaction</div>
      <label class="field">molecule sequence
        <input id="phys-seq" type="text" value="CC(=O)Oc1ccccc1C(=O)O" style="text-transform:none"></label>
      <div class="statrow"><span>channel</span><b id="phys-type">—</b></div>
      <div class="statrow"><span>conductance g</span><b id="phys-g">—</b></div>
      <div class="statrow"><span>US sensitivity</span><b id="phys-s">—</b></div>
      <div class="statrow"><span>membrane τ (leak)</span><b id="phys-tau">—</b></div>
      <div class="muted small">charge → cation (excite) / anion (inhibit); length → conductance; hydrophobicity → wave coupling. These define the model on the <b>2D &amp; 3D connectomes</b>.</div>
    </div>
    <div class="overlay controls">
      <div class="eyebrow">🧬 biophysical model</div>
      <label class="ctl">membrane permeability <input id="phys-perm" type="range" min="0.1" max="1" step="0.05" value="0.6"><span id="phys-perm-v">0.6</span></label>
      <label class="ctl">excitation potential <input id="phys-exc" type="range" min="0.4" max="3" step="0.1" value="1.6"><span id="phys-exc-v">1.6</span></label>
      <label class="ctl">inhibition potential <input id="phys-inh" type="range" min="0.5" max="3.5" step="0.1" value="2.2"><span id="phys-inh-v">2.2</span></label>
      <label class="ctl">wave–neuron coupling <input id="phys-couple" type="range" min="0.2" max="1.6" step="0.1" value="1.0"><span id="phys-couple-v">1.0</span></label>
      <label class="ctl">ultrasound pressure <input id="phys-press" type="range" min="0" max="8" step="0.5" value="5"><span id="phys-press-v">5</span></label>
      <div class="statrow"><span>PRE rate</span><b id="phys-prerate">—</b></div>
      <div class="statrow"><span>POST rate</span><b id="phys-postrate">—</b></div>
      <div class="muted small" id="phys-note">These sliders write into the live connectome sim (τ, excitatory gain, global inhibition), so the Brain-template & benches obey the same biophysics.</div>
    </div>`;

  const canvas = el.querySelector('#phys-canvas'), ctx = canvas.getContext('2d');
  const st = { pre: 0, post: 0, preTr: [], postTr: [], preSp: [], postSp: [], preCount: 0, postCount: 0, frame: 0 };
  let ch = channelSpec('CC(=O)Oc1ccccc1C(=O)O', 'smiles');
  const P = { perm: 0.6, exc: 1.6, inh: 2.2, couple: 1.0, press: 5 };
  const tau = () => 25 - P.perm * 18;   // higher permeability → leakier membrane → shorter τ

  // write the biophysical model into the live connectome sim (3D brain + Scanner 3D view)
  const applySim = () => {
    const s = window.__sim; if (!s) return;
    s.tau = tau(); s.gsyn = P.exc; s.globalInh = P.inh;
    WB.biophysics = { ...P, tau: tau() };
  };

  const setSeq = () => {
    const seq = el.querySelector('#phys-seq').value.trim() || 'C';
    ch = channelSpec(seq, 'smiles');
    WB.channel = { id: 'phys', sequence: seq, ...ch };
    el.querySelector('#phys-type').textContent = chanType(ch);
    el.querySelector('#phys-g').textContent = ch.conductance.toFixed(2);
    el.querySelector('#phys-s').textContent = ch.sensitivity.toFixed(2);
    el.querySelector('#phys-note').innerHTML = ch.sign > 0
      ? 'A <b>cation</b> channel — the PRE→POST synapse is <b>excitatory</b>: POST depolarizes toward threshold and fires.'
      : 'An <b>anion</b> channel — the PRE→POST synapse is <b>inhibitory</b>: POST is driven <b>below</b> rest and stays silent.';
  };
  const bind = (id, key) => { const i = el.querySelector(`#phys-${id}`), o = el.querySelector(`#phys-${id}-v`);
    const f = () => { P[key] = +i.value; o.textContent = i.value; el.querySelector('#phys-tau').textContent = tau().toFixed(1); applySim(); };
    i.addEventListener('input', f); f(); };
  ['perm', 'exc', 'inh', 'couple', 'press'].forEach((k) => bind(k, k));
  el.querySelector('#phys-seq').addEventListener('input', setSeq);
  setSeq();

  const resize = () => { const r = canvas.getBoundingClientRect(); const d = Math.min(devicePixelRatio || 1, 2);
    canvas.width = r.width * d; canvas.height = r.height * d; ctx.setTransform(d, 0, 0, d, 0, 0); st.w = r.width; st.h = r.height; };

  const step = () => {
    const T = tau();
    // interaction of waves with neurons: ultrasound opens the channel on PRE, drive ∝
    // pressure × sensitivity × coupling (how strongly the wave couples into the membrane).
    const drive = P.press * ch.sensitivity * 0.11 * P.couple;
    st.pre += (drive - st.pre / T) * DT + (Math.random() - 0.5) * 0.02;
    let preSpike = 0;
    if (st.pre >= VTH) { preSpike = 1; st.pre = 0; st.preCount++; }
    // synapse carries the channel's SIGN, scaled by the excitation / inhibition potential
    const potential = ch.sign > 0 ? P.exc : P.inh;
    const syn = preSpike * ch.sign * ch.conductance * potential;
    st.post += (syn + 0.03 - st.post / T) * DT + (Math.random() - 0.5) * 0.02;
    if (st.post < -0.6) st.post = -0.6;
    let postSpike = 0;
    if (st.post >= VTH) { postSpike = 1; st.post = 0; st.postCount++; }
    st.preTr.push(st.pre); st.postTr.push(st.post); st.preSp.push(preSpike); st.postSp.push(postSpike);
    const CAP = 260; if (st.preTr.length > CAP) { st.preTr.shift(); st.postTr.shift(); st.preSp.shift(); st.postSp.shift(); }
  };

  const lane = (tr, sp, y0, h, label, color) => {
    const W = st.w, base = y0 + h, top = y0 + h * 0.12;
    ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.strokeRect(24, y0, W - 48, h);
    ctx.strokeStyle = 'rgba(217,130,24,0.5)'; ctx.setLineDash([4, 4]); ctx.beginPath();
    ctx.moveTo(24, top); ctx.lineTo(W - 24, top); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(120,120,132,0.9)'; ctx.font = '600 11px system-ui'; ctx.fillText(label, 30, y0 + 16);
    ctx.fillStyle = 'rgba(180,140,60,0.9)'; ctx.font = '9px system-ui'; ctx.fillText('spike threshold', W - 130, top - 3);
    const n = tr.length, cw = (W - 48) / 260;
    ctx.beginPath();
    for (let i = 0; i < n; i++) { const v = Math.max(-0.6, Math.min(1, tr[i])); const y = base - ((v + 0.6) / 1.6) * (h - 6);
      ctx[i === 0 ? 'moveTo' : 'lineTo'](24 + i * cw, y); }
    ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = 1;
    for (let i = 0; i < n; i++) if (sp[i]) { const x = 24 + i * cw; ctx.beginPath(); ctx.moveTo(x, y0 + 4); ctx.lineTo(x, y0 + 14); ctx.stroke(); }
  };

  let raf = 0, stopped = false;
  const loop = () => {
    if (stopped) return;
    for (let k = 0; k < 3; k++) step();
    ctx.clearRect(0, 0, st.w, st.h);
    const h = (st.h - 90) / 2;
    lane(st.preTr, st.preSp, 40, h, 'PRE neuron — the wave opens the channel here (membrane depolarizes)', '#2f6fed');
    lane(st.postTr, st.postSp, 40 + h + 12, h, `POST neuron — via the ${chanType(ch)} synapse`, ch.sign > 0 ? '#0e9f6e' : '#c0392b');
    ctx.fillStyle = 'rgba(80,80,92,0.95)'; ctx.font = '600 12px system-ui';
    ctx.fillText('molecule → channel → 🔊 wave–neuron coupling → PRE spikes → synapse (E/I potential) → POST', 24, st.h - 16);
    st.frame++;
    if ((st.frame & 15) === 0) {
      el.querySelector('#phys-prerate').textContent = st.preCount; el.querySelector('#phys-postrate').textContent = st.postCount;
      st.preCount = 0; st.postCount = 0;
    }
    raf = requestAnimationFrame(loop);
  };
  requestAnimationFrame(() => { resize(); loop(); });
  return { stop() { stopped = true; cancelAnimationFrame(raf); } };
}
