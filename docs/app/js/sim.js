// Browser LIF simulation — the demo-mode mirror of the Python engine (P2/P4 preview).
// Leaky integrate-and-fire neurons over the real worm connectome, plus a locomotion
// read-out (forward vs reverse command neurons) that drives the virtual-environment worm.

// GABAergic (inhibitory) neuron families in C. elegans — their outputs are negative.
const INHIBITORY = [/^DD/, /^VD/, /^RME/, /^RIS/, /^AVL/, /^DVB/];

// Locomotion command circuit (the classic touch-response wiring).
const ROLES = {
  fwd: ['AVBL', 'AVBR', 'PVCL', 'PVCR'],          // forward command
  rev: ['AVAL', 'AVAR', 'AVDL', 'AVDR', 'AVEL', 'AVER'], // reverse command
  touchAnt: ['ALML', 'ALMR', 'AVM'],              // anterior gentle-touch sensory
  touchPost: ['PLML', 'PLMR', 'PVM'],             // posterior gentle-touch sensory
};

export class BrainSim {
  constructor(data) {
    this.data = data;
    const n = data.n_neurons;
    this.n = n;
    this.v = new Float32Array(n);         // membrane potential
    this.refr = new Float32Array(n);      // refractory countdown
    this.fired = new Uint8Array(n);       // spiked this step
    this.act = new Float32Array(n);       // smoothed activity (for coloring)
    this.stim = new Float32Array(n);      // injected stimulus current (decays)

    // name -> index
    this.idx = {};
    data.ids.forEach((name, i) => { this.idx[name] = i; });

    // per-neuron sign
    this.sign = new Float32Array(n).fill(1);
    data.ids.forEach((name, i) => {
      if (INHIBITORY.some((re) => re.test(name))) this.sign[i] = -1;
    });

    // build CSR-like out-edge lists: for pre i, list of [post, weight*sign].
    // Raw synapse counts (typically 1..5, occasionally larger); gsyn is matched so a
    // few active inputs ignite a target — the connectome, not a bias, carries the signal.
    this.out = Array.from({ length: n }, () => []);
    this.gsyn = 0.03;
    for (const [i, j, w] of data.edges) {
      this.out[i].push([j, w * this.sign[i]]);
    }

    this.roleIdx = {};
    for (const [k, names] of Object.entries(ROLES)) {
      this.roleIdx[k] = names.map((nm) => this.idx[nm]).filter((x) => x !== undefined);
    }

    // LIF params (dimensionless, tuned for a lively but bounded network)
    this.tau = 20; this.vth = 1.0; this.vreset = 0; this.refrLen = 4;
    this.bias = 0.02;           // low background → sparse baseline shimmer
    this.noise = 0.03;          // stochastic drive
    this.stimDecay = 0.96;      // injected stimulus fades over ~50 steps
    this.globalInh = 0.9;       // global inhibition ∝ population rate → prevents seizure
    this.pop = 0;               // running population firing rate
    this.locoCmd = 0.25;        // locomotion command −1(reverse)..+1(forward), rests forward
    this.t = 0;
  }

  stimulate(indices, amount = 3.0) {
    for (const i of indices) if (i !== undefined) this.stim[i] += amount;
  }

  stimulateRole(role, amount = 3.2) { this.stimulate(this.roleIdx[role] || [], amount); }

  // A gentle-touch = mechanosensory neurons firing + the withdrawal reflex circuit they
  // drive (command interneurons). Anterior touch → reversal, posterior touch → forward.
  touch(where) {
    if (where === 'anterior') { this.stimulateRole('touchAnt', 3.4); this.stimulateRole('rev', 2.4); this.locoCmd = -1.0; }
    else { this.stimulateRole('touchPost', 3.4); this.stimulateRole('fwd', 2.4); this.locoCmd = 1.0; }
  }

  // advance one millisecond-ish step
  step() {
    const { n, v, refr, fired, act, stim, out, gsyn, tau, vth, noise, bias } = this;
    const gi = this.globalInh * this.pop;   // global inhibition ∝ population rate
    // integrate
    for (let i = 0; i < n; i++) {
      fired[i] = 0;
      if (refr[i] > 0) { refr[i] -= 1; v[i] = this.vreset; continue; }
      let dv = -v[i] / tau + bias + stim[i] - gi + (Math.random() - 0.5) * noise;
      v[i] += dv;
      if (v[i] < -0.5) v[i] = -0.5;
      stim[i] *= this.stimDecay;
    }
    // spikes + propagation
    let nf = 0;
    for (let i = 0; i < n; i++) {
      if (refr[i] > 0) continue;
      if (v[i] >= vth) {
        fired[i] = 1; nf++; v[i] = this.vreset; refr[i] = this.refrLen;
        const e = out[i];
        for (let k = 0; k < e.length; k++) v[e[k][0]] += e[k][1] * gsyn;
      }
    }
    this.pop = this.pop * 0.7 + (nf / n) * 0.3;
    // smoothed activity for coloring — driven by actual spikes, not membrane voltage
    for (let i = 0; i < n; i++) act[i] = act[i] * 0.93 + fired[i] * 0.5;
    // locomotion command relaxes back toward a gentle forward crawl
    this.locoCmd += (0.25 - this.locoCmd) * 0.012;
    this.t += 1;
  }

  // mean firing of a role group (0..1-ish)
  roleActivity(role) {
    const ids = this.roleIdx[role]; if (!ids.length) return 0;
    let s = 0; for (const i of ids) s += this.act[i];
    return s / ids.length;
  }

  // locomotion command: >0 forward, <0 reverse (reflex output, engaged by touch)
  locomotion() { return this.locoCmd; }

  reset() {
    this.v.fill(0); this.refr.fill(0); this.act.fill(0); this.stim.fill(0);
    this.pop = 0; this.t = 0;
  }
}
