// Control-plane tab panels. "Brain template" is the live 3D viewer (+ virtual env);
// the other tabs swap in an info panel over the stage. Content mirrors the real backend
// seams (config-selected implementations) so the cockpit reflects the architecture.

const PANELS = {
  biomolecules: `
    <div class="eyebrow">Part 1 · Molecular engineering</div>
    <h2>Biomolecule design</h2>
    <p style="max-width:64ch">Neurons are made ultrasound-responsive by expressing <b>sonogenetic ion
    channels</b>. Those channels — and other neuro-interfacing biomolecules — are designed de novo by
    <a href="https://github.com/sanjaydoc/De-Novo-LLM">De-Novo-LLM</a>, a config-driven pipeline that
    generates small molecules, proteins/peptides, and nucleic acids.</p>
    <div class="pgrid">
      <div class="card"><div class="label">Small molecules</div><b>SMILES / SELFIES</b><p class="muted">GPT2-ZINC · property-conditioned (QED, logP)</p></div>
      <div class="card"><div class="label">Proteins / peptides</div><b>FASTA</b><p class="muted">ProGen2 · the sonogenetic channels</p></div>
      <div class="card"><div class="label">Nucleic acids</div><b>DNA / RNA</b><p class="muted">delivery constructs</p></div>
    </div>
    <p class="muted">In the twin, expression is an <b>ExpressionMask</b> the addressing model reads:
    only channel-expressing neurons respond to the ultrasound write — molecular selectivity on top of
    a coarse acoustic focus.</p>`,

  scanner: `
    <div class="eyebrow">Part 2 · Electronics &amp; hardware</div>
    <h2>Ultrasound scanner — read &amp; write</h2>
    <p style="max-width:64ch">Two physical subsystems, one interface each. v1 ships simulated adapters;
    real arrays plug into the same <code>NeuralInput</code> / <code>NeuralOutput</code> contracts.</p>
    <div class="pgrid">
      <div class="card">
        <span class="chip allow">WRITE</span><b style="margin-left:.4rem">Sonogenetics</b>
        <p class="muted">Focused ultrasound opens the expressed channels. <code>simulated_sono</code> →
        injects current shaped by the addressing model (focus × expression).</p>
      </div>
      <div class="card">
        <span class="chip allow">READ</span><b style="margin-left:.4rem">Neural dust</b>
        <p class="muted">Piezo motes report activity via ultrasonic backscatter.
        <code>simulated_dust</code> → one mote per neuron + noise (idealized).</p>
      </div>
    </div>
    <table>
      <thead><tr><th>Seam</th><th>v1 implementation</th><th>scales to</th></tr></thead>
      <tbody>
        <tr><td>Addressing</td><td><code>idealized</code> (per-neuron)</td><td><code>realistic</code>: focal blur × expression × mote pooling</td></tr>
        <tr><td>Write</td><td><code>simulated_sono</code></td><td><code>hardware_sono</code></td></tr>
        <tr><td>Read</td><td><code>simulated_dust</code></td><td><code>hardware_dust</code> (sparse motes)</td></tr>
      </tbody>
    </table>`,

  venv: `
    <div class="eyebrow">Part 4 · Virtual environment</div>
    <h2>The simulated world</h2>
    <p style="max-width:64ch">The engine runs one authoritative loop —
    <b>read (dust) → step → write (sono) → publish</b> — over the living twin. Locomotion is
    <b>decoded live from the command neurons</b>; the crawling worm on the right is driven by it.</p>
    <div class="pgrid">
      <div class="card"><div class="label">Neuron model</div><b>LIF</b><p class="muted">→ Hodgkin–Huxley (same interface)</p></div>
      <div class="card"><div class="label">Stepper</div><b>sparse matvec (CPU)</b><p class="muted">→ GPU / distributed</p></div>
      <div class="card"><div class="label">Environment</div><b>stimulus_protocol</b><p class="muted">universal · worm→human</p></div>
    </div>
    <p class="muted">Go back to <b>Brain template</b> and press ▶ Run — drive AVB (forward) or AVA
    (reverse) and watch the worm respond. The behaviour emerges from simulating the connectome.</p>`,

  system: `
    <div class="eyebrow">System</div>
    <h2>Configuration &amp; scale</h2>
    <p style="max-width:64ch">Every layer is a registry-backed interface selected by config
    (PLAN §2.2). Scaling up = loading the next profile — nothing worse than O(E) anywhere (§2.3).</p>
    <table>
      <thead><tr><th>Rung</th><th>Neurons</th><th>Synapses</th><th>Data</th></tr></thead>
      <tbody>
        <tr><td>C. elegans (worm)</td><td>302</td><td>~7,000</td><td><span class="chip allow">real</span></td></tr>
        <tr><td>MICrONS (mouse V1)</td><td>~200,000</td><td>~500,000,000</td><td><span class="chip allow">real</span></td></tr>
        <tr><td>Mouse (mesoscale)</td><td>~71,000,000</td><td>~10¹²</td><td><span class="chip allow">real</span></td></tr>
        <tr><td>Human (North Star)</td><td>~86,000,000,000</td><td>~10¹⁴</td><td><span class="chip deny">statistical</span></td></tr>
      </tbody>
    </table>
    <p class="muted">Swappable seams: connectome · neuron model · stepper · read · write · addressing ·
    environment · renderer. Run a live backend with <code>bci serve</code> (REST + WebSocket).</p>`,
};

import { renderBiomolecules } from './molecular.js';

const panel = document.getElementById('panel');
const tabs = [...document.querySelectorAll('.tab')];
tabs.forEach((t) => t.addEventListener('click', () => {
  tabs.forEach((x) => x.classList.toggle('active', x === t));
  const key = t.dataset.tab;
  if (key === 'brain') { panel.hidden = true; panel.innerHTML = ''; return; }
  panel.hidden = false;
  if (key === 'biomolecules') { renderBiomolecules(panel); }
  else { panel.innerHTML = `<div class="panel-inner">${PANELS[key] || ''}</div>`; }
}));
