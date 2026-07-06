// Browser LIF simulation — the demo-mode mirror of the Python engine (bci.simulation).
// Real leaky integrate-and-fire over the real connectome. Per-neuron synaptic
// normalization (homeostatic scaling) keeps activity structured so pathway effects show
// through. Locomotion is DECODED LIVE from the command neurons — nothing is scripted.

const INHIBITORY = [/^DD/, /^VD/, /^RME/, /^RIS/, /^AVL/, /^DVB/, /^RID/];

const ROLES = {
  fwd: ['AVBL', 'AVBR', 'PVCL', 'PVCR'],                    // forward command
  rev: ['AVAL', 'AVAR', 'AVDL', 'AVDR', 'AVEL', 'AVER'],    // reverse command
  touchAnt: ['ALML', 'ALMR', 'AVM'],                        // anterior gentle-touch
  touchPost: ['PLML', 'PLMR', 'PVM'],                       // posterior gentle-touch
};

export class BrainSim {
  constructor(data) {
    this.data = data;
    const n = data.n_neurons;
    this.n = n;
    this.v = new Float32Array(n);
    this.refr = new Float32Array(n);
    this.fired = new Uint8Array(n);
    this.act = new Float32Array(n);
    this.stim = new Float32Array(n);

    this.idx = {};
    data.ids.forEach((name, i) => { this.idx[name] = i; });

    this.sign = new Float32Array(n).fill(1);
    data.ids.forEach((name, i) => { if (INHIBITORY.some((re) => re.test(name))) this.sign[i] = -1; });

    // per-post synaptic normalization: divide each neuron's incoming weights by their
    // total magnitude → no hub saturates, and relative pathway strengths are preserved.
    const inSum = new Float32Array(n);
    for (const [, j, w] of data.edges) inSum[j] += Math.abs(w);
    this.out = Array.from({ length: n }, () => []);
    for (const [i, j, w] of data.edges) {
      const norm = inSum[j] > 0 ? 1 / inSum[j] : 0;
      this.out[i].push([j, w * this.sign[i] * norm]);
    }
    this.gsyn = 2.0;

    this.roleIdx = {};
    for (const [k, names] of Object.entries(ROLES))
      this.roleIdx[k] = names.map((nm) => this.idx[nm]).filter((x) => x !== undefined);

    this.tau = 20; this.vth = 1.0; this.vreset = 0; this.refrLen = 4;
    this.bias = 0.02; this.noise = 0.03; this.stimDecay = 0.96;
    this.globalInh = 0.9; this.pop = 0; this.t = 0;
  }

  stimulate(indices, amount = 3.4) { for (const i of indices) if (i !== undefined) this.stim[i] += amount; }
  stimulateRole(role, amount = 3.4) { this.stimulate(this.roleIdx[role] || [], amount); }

  step() {
    const { n, v, refr, fired, act, stim, out, gsyn, tau, vth, noise, bias } = this;
    const gi = this.globalInh * this.pop;
    for (let i = 0; i < n; i++) {
      fired[i] = 0;
      if (refr[i] > 0) { refr[i] -= 1; v[i] = this.vreset; continue; }
      v[i] += -v[i] / tau + bias + stim[i] - gi + (Math.random() - 0.5) * noise;
      if (v[i] < -0.5) v[i] = -0.5;
      stim[i] *= this.stimDecay;
    }
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
    for (let i = 0; i < n; i++) act[i] = act[i] * 0.93 + fired[i] * 0.5;
    this.t += 1;
  }

  roleActivity(role) {
    const ids = this.roleIdx[role]; if (!ids || !ids.length) return 0;
    let s = 0; for (const i of ids) s += this.act[i];
    return s / ids.length;
  }

  // locomotion decoded live from the command neurons — emerges from the connectome.
  locomotion() { return this.roleActivity('fwd') - this.roleActivity('rev'); }

  reset() { this.v.fill(0); this.refr.fill(0); this.act.fill(0); this.stim.fill(0); this.pop = 0; this.t = 0; }
}
