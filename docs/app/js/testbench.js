// Molecular test bench — the BCI loop made visible on the selected connectome.
//
//   sequence → channel (sign · sensitivity · conductance)   [Part 1: molecule]
//        → SONOGENETICS ULTRASOUND focuses on a spot, opening the channel there  [Part 2: WRITE]
//        → the real connectome simulation responds and the activity propagates    [Part 3: brain]
//        → NEURAL DUST at recording sites reads the evoked response back out       [Part 2: READ]
//
// The sequence→channel map is a transparent composition proxy (see channelSpec), NOT a
// validated biophysical predictor — but everything downstream is the real LIF connectome.

import { BrainSim } from './sim.js';

export class TestBench {
  constructor(canvas, data, channel, onDone, opts = {}) {
    this.c = canvas; this.ctx = canvas.getContext('2d');
    this.data = data; this.ch = channel; this.onDone = onDone;
    this.interactive = !!opts.interactive;   // Scanner mode: aim + pulse on demand, free-running
    this.usPulse = 0; this.pulse = null;      // active pulse envelope for interactive mode
    this.sim = new BrainSim(data);
    this.resize();
    this._project();
    this._pickFocus();
    this._pickExpressing();
    this._pickDust();
    this.exprIdx = this.expr.map((e) => e[0]);   // the neurons the channel acts on
    this.t = 0; this.readout = []; this.baseDiff = []; this.evDiff = [];
    this.raf = 0; this.stopped = false;
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const r = this.c.getBoundingClientRect();
    this.w = r.width; this.h = r.height;
    this.c.width = this.w * dpr; this.c.height = this.h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // project 3D soma positions to 2D canvas space (x, z), fit with a margin, leave headroom
  // at the top for the ultrasound transducer and at the bottom for the dust readout.
  _project() {
    const pos = this.data.pos, n = pos.length;
    let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
    for (const p of pos) { mnx = Math.min(mnx, p[0]); mxx = Math.max(mxx, p[0]); mny = Math.min(mny, p[2]); mxy = Math.max(mxy, p[2]); }
    const mL = 24, mT = 58, mB = 74, mR = 24;
    const sx = (this.w - mL - mR) / ((mxx - mnx) || 1);
    const sy = (this.h - mT - mB) / ((mxy - mny) || 1);
    const s = Math.min(sx, sy);
    const ox = mL + ((this.w - mL - mR) - (mxx - mnx) * s) / 2;
    const oy = mT + ((this.h - mT - mB) - (mxy - mny) * s) / 2;
    this.P = new Array(n);
    let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
    for (let i = 0; i < n; i++) {
      const px = ox + (pos[i][0] - mnx) * s, py = oy + (pos[i][2] - mny) * s;
      this.P[i] = [px, py];
      bx0 = Math.min(bx0, px); bx1 = Math.max(bx1, px); by0 = Math.min(by0, py); by1 = Math.max(by1, py);
    }
    this.bbox = [bx0, bx1, by0, by1];
  }

  // ultrasound focal spot. Priority: a named worm command population (the dropdown), else the
  // molecule's own EXPRESSION LOCUS derived from its sequence (so different molecules land on
  // different tissue), else the most-connected hub.
  _pickFocus() {
    const roleIdx = this.sim.roleIdx[this.ch.target];
    if (roleIdx && roleIdx.length) {
      let fx = 0, fy = 0; for (const i of roleIdx) { fx += this.P[i][0]; fy += this.P[i][1]; }
      this.focus = [fx / roleIdx.length, fy / roleIdx.length];
    } else if (this.ch.locus) {
      const [x0, x1, y0, y1] = this.bbox;
      this.focus = [x0 + this.ch.locus[0] * (x1 - x0), y0 + this.ch.locus[1] * (y1 - y0)];
    } else {
      const deg = this.data.outdeg || [];
      const idx = deg.length ? deg.indexOf(Math.max(...deg)) : Math.floor(this.P.length / 2);
      this.focus = this.P[idx].slice();
    }
  }

  // neurons the focused ultrasound reaches: nearest ~12% to the focus, Gaussian-weighted by
  // distance (the acoustic focal spot). Their weight × the channel's sensitivity/conductance
  // sets how hard they're driven.
  _pickExpressing() {
    const d = this.P.map((p, i) => [(p[0] - this.focus[0]) ** 2 + (p[1] - this.focus[1]) ** 2, i]);
    d.sort((a, b) => a[0] - b[0]);
    const k = Math.max(4, Math.floor(this.P.length * 0.12));
    const near = d.slice(0, k);
    const sigma2 = (near[near.length - 1][0] || 1) * 0.5;
    this.expr = near.map(([dist, i]) => [i, Math.exp(-dist / (sigma2 + 1e-6))]);   // [idx, weight]
  }

  // scatter a handful of neural-dust motes across the tissue to record the response.
  _pickDust() {
    const n = this.P.length, m = 5;
    this.dust = Array.from({ length: m }, (_, k) => {
      const i = Math.floor((k + 0.5) * n / m);
      // each mote senses its ~1% nearest neighbours
      const d = this.P.map((p, j) => [(p[0] - this.P[i][0]) ** 2 + (p[1] - this.P[i][1]) ** 2, j]);
      d.sort((a, b) => a[0] - b[0]);
      return { at: this.P[i], sense: d.slice(0, Math.max(3, Math.floor(n * 0.01))).map((x) => x[1]) };
    });
  }

  start() {
    const loop = () => {
      if (this.stopped) return;
      this._tick();
      if (this.t >= 230) { this._finish(); return; }
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }
  stop() { this.stopped = true; cancelAnimationFrame(this.raf); }

  // SONOGENETICS WRITE — inject current into the focal expressing neurons. signedGain already
  // carries the sign (+ cation/excite, − anion/inhibit); env is the 0..1 pulse envelope.
  _write(signedGain, env) {
    this.usPulse = env;
    const g = signedGain * env;
    for (const [i, wgt] of this.expr) this.sim.stim[i] += g * wgt * 0.12;
  }

  // NEURAL DUST READ — each mote reports the mean activity of the neurons it senses.
  _read() {
    let dustSum = 0;
    for (const mote of this.dust) {
      let a = 0; for (const j of mote.sense) a += this.sim.act[j];
      mote.level = a / mote.sense.length; dustSum += mote.level;
    }
    this.readout.push(dustSum / this.dust.length);
    if (this.readout.length > 220) this.readout.shift();
  }

  // -- interactive (Scanner) mode: free-running loop, aim + pulse on demand -----------------
  startLive() {
    const loop = () => {
      if (this.stopped) return;
      if (this.pulse) {                          // an active user pulse
        const env = Math.sin((this.pulse.t / 34) * Math.PI);
        if (env > 0 && this.pulse.t < 34) { this._write(this.pulse.g, env); this.pulse.t++; }
        else { this.pulse = null; this.usPulse = 0; }
      } else this.usPulse = 0;
      this.sim.step();
      this._read();
      this._draw();
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }
  aimAt(px, py) {   // set the ultrasound focus from a canvas click
    this.focus = [px, py]; this._pickExpressing(); this.exprIdx = this.expr.map((e) => e[0]);
  }
  firePulse(sign, gain) { this.pulse = { t: 0, g: sign * gain }; }   // signed gain
  liveStats() {
    let f = 0, m = 0; for (let i = 0; i < this.sim.n; i++) { if (this.sim.act[i] > 0.1) f++; m += this.sim.act[i]; }
    return { motesActive: f, backscatter: +(m / this.sim.n).toFixed(3), readout: this.readout.at(-1) || 0 };
  }

  _tick() {
    this.t++;
    // timeline: baseline → ultrasound pulse (write) → propagate + read
    if (this.t < 55) this.phase = 'baseline';
    else if (this.t < 92) this.phase = 'write';
    else this.phase = 'read';

    // Sign +1 = cation (excite), −1 = anion (inhibit → negative stim hyperpolarizes).
    if (this.phase === 'write') {
      const env = Math.sin(((this.t - 55) / 37) * Math.PI);
      this._write(5.5 * this.ch.sensitivity * this.ch.conductance * this.ch.sign, env);
    } else this.usPulse = 0;

    this.sim.step();
    this._read();

    // Verdict = the focal (channel-bearing) neurons' activity RELATIVE to the whole network.
    // Absolute firing is misleading (a strong focal excite raises global inhibition / can seize
    // the net, dropping everyone). The differential focal−global isolates what the channel did
    // to its own neurons: excitation lifts them above the surround, inhibition drops them below —
    // robust to whatever the global state does.
    let fa = 0; for (const i of this.exprIdx) fa += this.sim.act[i]; fa /= this.exprIdx.length;
    let ga = 0; for (let i = 0; i < this.sim.n; i++) ga += this.sim.act[i]; ga /= this.sim.n;
    const diff = fa - ga;
    if (this.t >= 25 && this.t < 55) this.baseDiff.push(diff);
    if (this.t >= 66 && this.t < 92) this.evDiff.push(diff);    // while the channel is open (pulse)

    this._draw();
  }

  _finish() {
    const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
    const delta = mean(this.evDiff) - mean(this.baseDiff);   // focal−global shift under the pulse
    const score = Math.min(1, Math.abs(delta) / 0.12);
    this.result = {
      delta: +delta.toFixed(3),
      direction: delta > 0.015 ? 'excited' : (delta < -0.015 ? 'suppressed' : 'weak'),
      score: +score.toFixed(2),
    };
    this._draw();
    if (this.onDone) this.onDone(this.result);
  }

  _draw() {
    const ctx = this.ctx, W = this.w, H = this.h;
    ctx.clearRect(0, 0, W, H);

    // --- edges (faint) + neurons coloured by activity -----------------------------------
    const act = this.sim.act, P = this.P, n = P.length;
    const dotR = n > 4000 ? 1.1 : n > 1200 ? 1.6 : 2.4;
    for (let i = 0; i < n; i++) {
      const a = Math.min(1, act[i] * 6);
      ctx.beginPath(); ctx.arc(P[i][0], P[i][1], dotR + a * 1.2, 0, 6.283);
      ctx.fillStyle = a > 0.05
        ? `rgba(${230},${150 - a * 40 | 0},${40 + (1 - a) * 120 | 0},${0.55 + 0.4 * a})`
        : 'rgba(120,132,150,0.42)';
      ctx.fill();
    }

    // --- expressing (channel-bearing) neurons: subtle ring while the pulse is on ---------
    if (this.usPulse > 0.02) {
      ctx.strokeStyle = `rgba(47,111,237,${0.15 + 0.5 * this.usPulse})`; ctx.lineWidth = 1;
      for (const [i] of this.expr) { ctx.beginPath(); ctx.arc(P[i][0], P[i][1], dotR + 2.5, 0, 6.283); ctx.stroke(); }
    }

    // --- SONOGENETICS ULTRASOUND transducer + focusing beam (WRITE) ----------------------
    const tx = this.focus[0], top = 12;
    ctx.strokeStyle = '#2f6fed'; ctx.lineWidth = 3; ctx.beginPath();
    ctx.arc(tx, top - 8, 20, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();  // transducer arc
    if (this.usPulse > 0.01) {
      // converging beam + travelling wavefronts down to the focus
      ctx.strokeStyle = `rgba(47,111,237,${0.25 + 0.5 * this.usPulse})`; ctx.lineWidth = 1.2;
      for (const dx of [-18, 18]) { ctx.beginPath(); ctx.moveTo(tx + dx, top); ctx.lineTo(this.focus[0], this.focus[1]); ctx.stroke(); }
      for (let w = 0; w < 4; w++) {
        const fr = ((this.t * 0.06 + w / 4) % 1);
        const y = top + fr * (this.focus[1] - top), hw = 18 * (1 - fr);
        ctx.globalAlpha = (1 - fr) * this.usPulse; ctx.beginPath();
        ctx.moveTo(tx - hw, y); ctx.lineTo(tx + hw, y); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // focal glow
      const g = ctx.createRadialGradient(this.focus[0], this.focus[1], 1, this.focus[0], this.focus[1], 26);
      g.addColorStop(0, `rgba(47,111,237,${0.35 * this.usPulse})`); g.addColorStop(1, 'rgba(47,111,237,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(this.focus[0], this.focus[1], 26, 0, 6.283); ctx.fill();
    }

    // --- NEURAL DUST motes (READ) -------------------------------------------------------
    for (const mote of this.dust) {
      const lv = Math.min(1, (mote.level || 0) * 5);
      ctx.save(); ctx.translate(mote.at[0], mote.at[1]); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = `rgba(14,159,110,${0.5 + 0.5 * lv})`; ctx.fillRect(-2.6, -2.6, 5.2, 5.2);
      ctx.restore();
      if (lv > 0.1) { ctx.strokeStyle = `rgba(14,159,110,${lv})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(mote.at[0], mote.at[1], 5 + lv * 4, 0, 6.283); ctx.stroke(); }
    }

    // --- dust readout trace along the bottom --------------------------------------------
    const by = H - 30, bh = 26;
    ctx.fillStyle = 'rgba(120,120,132,0.9)'; ctx.font = '600 10px system-ui, sans-serif';
    ctx.fillText('NEURAL DUST READOUT', 24, by - 8);
    ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.strokeRect(24, by, W - 48, bh);
    if (this.readout.length > 1) {
      const cw = (W - 48) / 220;
      ctx.beginPath();
      for (let x = 0; x < this.readout.length; x++) { const y = by + bh - Math.min(1, this.readout[x] * 4) * bh; ctx[x === 0 ? 'moveTo' : 'lineTo'](24 + x * cw, y); }
      ctx.strokeStyle = 'rgba(14,159,110,0.95)'; ctx.lineWidth = 1.6; ctx.stroke();
    }

    // --- captions -----------------------------------------------------------------------
    ctx.fillStyle = 'rgba(80,80,92,0.95)'; ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillText('🔊 sonogenetics ultrasound (write)', tx + 26, top - 2);
    let label;
    if (this.interactive) {
      label = this.usPulse > 0.01
        ? `ultrasound pulse — ${this.pulse && this.pulse.g > 0 ? 'exciting' : 'inhibiting'} the focus`
        : 'aim: click the tissue to move the focus · then deliver a pulse';
    } else {
      label = this.phase === 'baseline' ? 'baseline — resting activity'
        : this.phase === 'write' ? `ultrasound pulse — ${this.ch.sign > 0 ? 'cation channel opens (excite)' : 'anion channel opens (inhibit)'}`
          : 'reading the evoked response';
    }
    ctx.fillStyle = 'rgba(47,111,237,0.95)'; ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillText(label, 24, 14);
  }
}
