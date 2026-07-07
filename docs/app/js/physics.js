// Physics panel — the molecular/wave interaction physics, live.
// A minimal 2-neuron circuit (pre → synapse → post) driven by a sonogenetic channel, so you
// see the whole chain in real time: sequence → channel (sign / conductance / sensitivity) →
// ultrasound opens the channel on PRE → PRE spikes (LIF) → synapse carries the effect (the
// channel's sign) → POST is EXCITED (depolarizes, fires) or INHIBITED (hyperpolarizes, silenced).
// Same LIF + E/I model as the connectome sim, reduced to two cells you can watch.

import { channelSpec, chanType } from './molecular.js';
import { WB } from './workbench.js';

const VTH = 1.0, TAU = 14, DT = 1;

export function renderPhysics(el) {
  el.classList.add('stage');
  el.innerHTML = `
    <canvas id="phys-canvas" class="stage-canvas"></canvas>
    <div class="overlay stats" style="max-width:300px">
      <div class="eyebrow">Physics · sequence → channel</div>
      <label class="field">molecule sequence
        <input id="phys-seq" type="text" value="CC(=O)Oc1ccccc1C(=O)O" style="text-transform:none"></label>
      <div class="statrow"><span>channel</span><b id="phys-type">—</b></div>
      <div class="statrow"><span>conductance g</span><b id="phys-g">—</b></div>
      <div class="statrow"><span>US sensitivity</span><b id="phys-s">—</b></div>
      <div class="muted small">charge → cation (excite) / anion (inhibit); length → conductance; hydrophobicity → ultrasound coupling.</div>
    </div>
    <div class="overlay controls">
      <div class="eyebrow">🔊 wave → membrane</div>
      <label class="ctl">ultrasound pressure <input id="phys-press" type="range" min="0" max="8" step="0.5" value="5"><span id="phys-press-v">5</span></label>
      <label class="ctl">synaptic gain <input id="phys-gsyn" type="range" min="0.2" max="3" step="0.1" value="1.6"><span id="phys-gsyn-v">1.6</span></label>
      <label class="ctl">wave frequency <input id="phys-freq" type="range" min="0.2" max="2" step="0.1" value="1.0"><span id="phys-freq-v">1.0</span> MHz</label>
      <div class="statrow"><span>PRE rate</span><b id="phys-prerate">—</b></div>
      <div class="statrow"><span>POST rate</span><b id="phys-postrate">—</b></div>
      <div class="muted small" id="phys-note">Excitatory channel drives POST to fire; inhibitory channel silences it. Frequency sets the focal spot (higher = tighter, shallower).</div>
    </div>`;

  const canvas = el.querySelector('#phys-canvas'), ctx = canvas.getContext('2d');
  const st = { pre: 0, post: 0, preTr: [], postTr: [], preSp: [], postSp: [], preCount: 0, postCount: 0, frame: 0 };
  let ch = channelSpec('CC(=O)Oc1ccccc1C(=O)O', 'smiles');
  const P = { press: 5, gsyn: 1.6, freq: 1.0 };

  const setSeq = () => {
    const seq = el.querySelector('#phys-seq').value.trim() || 'C';
    ch = channelSpec(seq, 'smiles');
    WB.channel = { id: 'phys', sequence: seq, ...ch };
    el.querySelector('#phys-type').textContent = chanType(ch);
    el.querySelector('#phys-g').textContent = ch.conductance.toFixed(2);
    el.querySelector('#phys-s').textContent = ch.sensitivity.toFixed(2);
    el.querySelector('#phys-note').innerHTML = ch.sign > 0
      ? 'This is a <b>cation</b> channel — PRE→POST synapse is <b>excitatory</b>: POST depolarizes toward threshold and fires.'
      : 'This is an <b>anion</b> channel — PRE→POST synapse is <b>inhibitory</b>: POST is pushed <b>below</b> rest and stays silent.';
  };
  const bind = (id, key) => { const i = el.querySelector(`#phys-${id}`), o = el.querySelector(`#phys-${id}-v`);
    const f = () => { P[key] = +i.value; o.textContent = i.value; }; i.addEventListener('input', f); f(); };
  bind('press', 'press'); bind('gsyn', 'gsyn'); bind('freq', 'freq');
  el.querySelector('#phys-seq').addEventListener('input', setSeq);
  setSeq();

  const resize = () => { const r = canvas.getBoundingClientRect(); const d = Math.min(devicePixelRatio || 1, 2);
    canvas.width = r.width * d; canvas.height = r.height * d; ctx.setTransform(d, 0, 0, d, 0, 0); st.w = r.width; st.h = r.height; };

  const step = () => {
    // ultrasound opens the channel on PRE: drive ∝ pressure × sensitivity (× a frequency
    // coupling factor — a resonance-like peak so "wave frequency" changes the effect).
    const fcoup = 1 - 0.35 * Math.abs(P.freq - 1.0);
    const drive = P.press * ch.sensitivity * 0.11 * Math.max(0.4, fcoup);
    st.pre += (drive - st.pre / TAU) * DT + (Math.random() - 0.5) * 0.02;
    let preSpike = 0;
    if (st.pre >= VTH) { preSpike = 1; st.pre = 0; st.preCount++; }
    // synapse carries the channel's SIGN: cation excites (+), anion inhibits (−)
    const syn = preSpike * ch.sign * ch.conductance * P.gsyn;
    st.post += (syn + 0.03 - st.post / TAU) * DT + (Math.random() - 0.5) * 0.02;
    if (st.post < -0.6) st.post = -0.6;                 // hyperpolarization floor
    let postSpike = 0;
    if (st.post >= VTH) { postSpike = 1; st.post = 0; st.postCount++; }
    st.preTr.push(st.pre); st.postTr.push(st.post); st.preSp.push(preSpike); st.postSp.push(postSpike);
    const CAP = 260; if (st.preTr.length > CAP) { st.preTr.shift(); st.postTr.shift(); st.preSp.shift(); st.postSp.shift(); }
  };

  const lane = (tr, sp, y0, h, label, color) => {
    const W = st.w, base = y0 + h, mid = y0 + h * 0.62, top = y0 + h * 0.12;
    ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.strokeRect(24, y0, W - 48, h);
    // threshold line
    ctx.strokeStyle = 'rgba(217,130,24,0.5)'; ctx.setLineDash([4, 4]); ctx.beginPath();
    ctx.moveTo(24, top); ctx.lineTo(W - 48 + 24, top); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(120,120,132,0.9)'; ctx.font = '600 11px system-ui'; ctx.fillText(label, 30, y0 + 16);
    ctx.fillStyle = 'rgba(180,140,60,0.9)'; ctx.font = '9px system-ui'; ctx.fillText('spike threshold', W - 130, top - 3);
    const n = tr.length, cw = (W - 48) / 260;
    ctx.beginPath();
    for (let i = 0; i < n; i++) { const v = Math.max(-0.6, Math.min(1, tr[i])); const y = base - ((v + 0.6) / 1.6) * (h - 6);
      ctx[i === 0 ? 'moveTo' : 'lineTo'](24 + i * cw, y); }
    ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.stroke();
    // spikes
    ctx.strokeStyle = color; ctx.lineWidth = 1;
    for (let i = 0; i < n; i++) if (sp[i]) { const x = 24 + i * cw; ctx.beginPath(); ctx.moveTo(x, y0 + 4); ctx.lineTo(x, y0 + 14); ctx.stroke(); }
  };

  let raf = 0, stopped = false;
  const loop = () => {
    if (stopped) return;
    for (let k = 0; k < 3; k++) step();     // a few sim steps per frame
    ctx.clearRect(0, 0, st.w, st.h);
    const h = (st.h - 90) / 2;
    lane(st.preTr, st.preSp, 40, h, 'PRE neuron — ultrasound opens the channel here', '#2f6fed');
    lane(st.postTr, st.postSp, 40 + h + 12, h, `POST neuron — via ${chanType(ch)} synapse`, ch.sign > 0 ? '#0e9f6e' : '#c0392b');
    ctx.fillStyle = 'rgba(80,80,92,0.95)'; ctx.font = '600 12px system-ui';
    ctx.fillText('sequence → channel → 🔊 ultrasound → PRE spikes → synapse → POST effect', 24, st.h - 16);
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
