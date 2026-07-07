// BCI control plane — 3D connectome viewer + live simulation (P1–P4 preview, demo mode).
// Neurons render as instanced spheres; running the brain lights them by firing activity,
// stimuli propagate through the real connectome, and the command neurons crawl the worm.

import * as THREE from './lib/three.module.min.js';
import { OrbitControls } from './lib/OrbitControls.js';
import { BrainSim } from './sim.js';
import { WormViz } from './worm2d.js';

const $ = (id) => document.getElementById(id);

// three-stop color ramp (template-blue → venv-green → scanner-orange)
const STOPS = [[0x2f, 0x6f, 0xed], [0x0e, 0x9f, 0x6e], [0xd9, 0x82, 0x18]];
function ramp(t) {
  t = Math.max(0, Math.min(1, t));
  const seg = t < 0.5 ? 0 : 1, f = t < 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
  const a = STOPS[seg], b = STOPS[seg + 1];
  return [(a[0] + (b[0] - a[0]) * f) / 255, (a[1] + (b[1] - a[1]) * f) / 255, (a[2] + (b[2] - a[2]) * f) / 255];
}

const container = $('viewer');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
container.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const key = new THREE.DirectionalLight(0xffffff, 0.85);
key.position.set(1, 1, 1);
scene.add(key);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.9;

let neuronMesh = null, pointsMesh = null, edgeLines = null, data = null;
let sim = null, worm = null, running = false;
let baseCol = null;             // Float32Array n*3, out-degree ramp
let renderMode = 'instanced';   // 'instanced' (spheres, small) | 'points' (GPU, LOD)
let colorAttr = null;           // Points color buffer (LOD path)
const LOD_THRESHOLD = 8000;     // above this, render as GPU points + sampled edges
const MAX_EDGES = 120000;       // cap rendered edge segments for large connectomes
const homeTarget = new THREE.Vector3();
const HOME = [10, 55, 215];

function resize() {
  const el = renderer.domElement;
  const w = el.clientWidth || container.clientWidth;
  const h = el.clientHeight || container.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);   // match drawing buffer to the CSS box (don't restyle)
  camera.aspect = w / h; camera.updateProjectionMatrix();
  if (worm) worm.resize();
}
window.addEventListener('resize', resize);

// --- connectome selection ----------------------------------------------------
let started = false;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A synthetic network (real SyntheticSource, in the browser) — shows the platform's
// pluggability + scale. Not a real organism; clearly labelled as synthetic.
function makeSynthetic(n, k = 8) {
  const rng = mulberry32(12345);
  const pos = [], ids = [], types = [], outdeg = new Array(n).fill(0), edges = [];
  for (let i = 0; i < n; i++) {
    pos.push([(rng() * 2 - 1) * 140, (rng() * 2 - 1) * 140, (rng() * 2 - 1) * 140]);
    ids.push('n' + i); types.push('synthetic');
  }
  for (let i = 0; i < n; i++) for (let e = 0; e < k; e++) {
    const j = (rng() * n) | 0; if (j === i) continue;
    edges.push([i, j, 1 + ((rng() * 4) | 0)]); outdeg[i]++;
  }
  return { name: `Synthetic · ${n.toLocaleString()}`, n_neurons: n, n_synapses: edges.length,
    ids, types, pos, outdeg, edges };
}

const FETCH_HINT = {
  microns: 'python scripts/fetch_microns.py --max-neurons 20000',
  drosophila: 'python scripts/fetch_drosophila.py --neurons neurons.csv --connections connections.csv',
  mesoscale: 'python scripts/fetch_mouse_mesoscale.py   # then: bci load profiles/mouse.yaml',
};

function showFetchMsg(val) {
  const panel = $('panel'); if (!panel) return;
  const nice = val === 'microns' ? 'MICrONS mouse cortex'
    : val === 'mesoscale' ? 'Mouse mesoscale (Allen)' : 'Drosophila (FlyWire)';
  panel.innerHTML = `<div class="panel-inner">
    <div class="eyebrow">${val} · not cached in this browser</div>
    <h2>${nice} loads from a local fetch</h2>
    <p style="max-width:62ch">Real large connectomes aren't shipped with the hosted demo —
    they need internet + free credentials (CAVE for MICrONS, FlyWire Codex for Drosophila)
    and a downsample step. On your own machine, run the fetch script, then this option loads
    the real data via the LOD renderer:</p>
    <pre><code>${FETCH_HINT[val]}</code></pre>
    <p class="muted">See <a href="../RUN.md">RUN.md</a> for setup. Meanwhile, the worm and the
    synthetic previews (incl. 50,000-neuron LOD) run right here.</p>
  </div>`;
  panel.hidden = false;
}

function loadConnectome(val) {
  if (val === 'celegans') {
    fetch('./data/celegans.json').then(r => r.json())
      .then(d => build({ ...d, name: 'C. elegans' }))
      .catch(err => { const l = $('loading'); if (l) l.textContent = 'Failed: ' + err; });
  } else if (val.startsWith('synthetic:')) {
    build(makeSynthetic(+val.split(':')[1], 8));
  } else if (val === 'microns' || val === 'drosophila' || val === 'mesoscale') {
    fetch(`./data/${val}.json`)
      .then(r => { if (!r.ok) throw new Error('not cached'); return r.json(); })
      .then(build)
      .catch(() => showFetchMsg(val));
  }
}
loadConnectome('celegans');

function disposeScene() {
  for (const o of [neuronMesh, pointsMesh, edgeLines]) {
    if (!o) continue;
    scene.remove(o); o.geometry.dispose(); o.material.dispose();
  }
  neuronMesh = pointsMesh = edgeLines = colorAttr = null;
}

function build(d) {
  disposeScene();
  data = d;
  const l = $('loading'); if (l) l.remove();
  $('cx-name').textContent = d.name || 'C. elegans';
  $('cx-neurons').textContent = d.n_neurons.toLocaleString();
  $('cx-synapses').textContent = d.n_synapses.toLocaleString();

  const pos = d.pos;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of pos) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
  const center = min.map((m, k) => (m + max[k]) / 2);
  const extent = Math.max(...max.map((m, k) => m - min[k]));
  const S = 170 / extent;
  const P = pos.map(p => [(p[1] - center[1]) * S, (p[2] - center[2]) * S, (p[0] - center[0]) * S]);

  const n = d.n_neurons;
  const maxDeg = Math.max(1, ...d.outdeg);
  baseCol = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const [r, g, b] = ramp(d.outdeg[i] / maxDeg);
    baseCol[i * 3] = r; baseCol[i * 3 + 1] = g; baseCol[i * 3 + 2] = b;
  }

  renderMode = n > LOD_THRESHOLD ? 'points' : 'instanced';
  if (renderMode === 'instanced') {
    // small connectome: shaded instanced spheres (click-to-inspect works)
    const geo = new THREE.SphereGeometry(1.6, 14, 12);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.0 });
    neuronMesh = new THREE.InstancedMesh(geo, mat, n);
    const dummy = new THREE.Object3D(), col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      dummy.position.set(P[i][0], P[i][1], P[i][2]); dummy.updateMatrix();
      neuronMesh.setMatrixAt(i, dummy.matrix);
      neuronMesh.setColorAt(i, col.setRGB(baseCol[i * 3], baseCol[i * 3 + 1], baseCol[i * 3 + 2]));
    }
    neuronMesh.instanceMatrix.needsUpdate = true;
    scene.add(neuronMesh);
  } else {
    // LOD path: GPU point sprites — renders 100k+ neurons smoothly
    const gpos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { gpos[i * 3] = P[i][0]; gpos[i * 3 + 1] = P[i][1]; gpos[i * 3 + 2] = P[i][2]; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(gpos, 3));
    colorAttr = new THREE.BufferAttribute(new Float32Array(baseCol), 3);
    g.setAttribute('color', colorAttr);
    const size = n > 80000 ? 1.4 : 2.2;
    pointsMesh = new THREE.Points(g, new THREE.PointsMaterial({ size, vertexColors: true, sizeAttenuation: true }));
    scene.add(pointsMesh);
  }

  // edges — sampled for large connectomes so we never draw millions of segments
  const E = d.edges.length;
  const stride = E > MAX_EDGES ? Math.ceil(E / MAX_EDGES) : 1;
  const m = Math.ceil(E / stride);
  const verts = new Float32Array(m * 6);
  let w = 0;
  for (let e = 0; e < E; e += stride) {
    const i = d.edges[e][0], j = d.edges[e][1];
    verts.set([P[i][0], P[i][1], P[i][2], P[j][0], P[j][1], P[j][2]], w * 6); w++;
  }
  const eg = new THREE.BufferGeometry();
  eg.setAttribute('position', new THREE.BufferAttribute(verts.subarray(0, w * 6), 3));
  edgeLines = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x333340, transparent: true, opacity: renderMode === 'points' ? 0.06 : 0.14 }));
  scene.add(edgeLines);

  sim = new BrainSim(d);
  window.__sim = sim;          // exposed for tuning/inspection
  window.__connectome = d;     // exposed for the molecular assay
  if (!worm) worm = new WormViz($('worm'));

  camera.position.set(...HOME); controls.target.copy(homeTarget);
  resize(); requestAnimationFrame(resize);
  toggleRun(true);   // the brain is spontaneously active from the start
  if (!started) { started = true; animate(); }
}

const col = new THREE.Color();
function updateNeuronColors() {
  const act = sim.act, n = sim.n;
  if (renderMode === 'points') {
    const arr = colorAttr.array;
    for (let i = 0; i < n; i++) {
      const a = Math.min(1, act[i] * 6), b = i * 3;
      arr[b] = baseCol[b] * (1 - a) + 1.0 * a;
      arr[b + 1] = baseCol[b + 1] * (1 - a) + 0.86 * a;
      arr[b + 2] = baseCol[b + 2] * (1 - a) + 0.25 * a;
    }
    colorAttr.needsUpdate = true;
    return;
  }
  for (let i = 0; i < n; i++) {
    const a = Math.min(1, act[i] * 6);
    col.setRGB(baseCol[i * 3] * (1 - a) + 1.0 * a,
      baseCol[i * 3 + 1] * (1 - a) + 0.86 * a,
      baseCol[i * 3 + 2] * (1 - a) + 0.25 * a);
    neuronMesh.setColorAt(i, col);
  }
  neuronMesh.instanceColor.needsUpdate = true;
}

let smAct = 0, smLoco = 0;   // muscle-integrated (smoothed) motor drive
function driveWorm() {
  // Everything here comes from the connectome simulation — no scripted motion.
  // The body integrates motor output (neuromuscular smoothing), so the crawl is
  // continuous even though neural firing pulses.
  let mean = 0; for (let i = 0; i < sim.n; i++) mean += sim.act[i]; mean /= sim.n;
  smAct = smAct * 0.9 + mean * 0.1;
  smLoco = smLoco * 0.9 + sim.locomotion() * 0.1;
  const active = smAct > 0.02;
  const dir = smLoco < -0.02 ? -1 : 1;
  const drive = active ? (0.15 + 3.4 * smAct + 1.3 * Math.abs(smLoco)) : 0;
  worm.frame({ drive, dir, activity: smAct, turn: dir < 0 ? 0.7 : 0 });

  const loco = $('loco');
  if (!active) { loco.textContent = 'idle'; loco.className = 'loco'; }
  else if (dir < 0) { loco.textContent = 'reversing ←'; loco.className = 'loco rev'; }
  else { loco.textContent = 'forward crawl →'; loco.className = 'loco fwd'; }

  let firing = 0; for (let i = 0; i < sim.n; i++) if (sim.act[i] > 0.08) firing++;
  $('cx-firing').textContent = firing;
}

let frame = 0;
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  if (running && sim) {
    for (let s = 0; s < 2; s++) sim.step();
    updateNeuronColors();
    driveWorm();
  }
  // when paused, nothing moves — the worm only moves from live brain activity
  renderer.render(scene, camera);
  frame++;
}

// --- picking: click a neuron to inspect (and stimulate while running) ---------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let downXY = null;
renderer.domElement.addEventListener('pointerdown', e => { downXY = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', e => {
  if (!downXY || Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]) > 4) return;
  const rect = renderer.domElement.getBoundingClientRect();
  ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  ray.setFromCamera(ndc, camera);
  const hit = neuronMesh ? ray.intersectObject(neuronMesh) : [];
  const insp = $('inspector');
  if (hit.length) {
    const i = hit[0].instanceId;
    $('i-id').textContent = data.ids[i]; $('i-type').textContent = data.types[i];
    $('i-deg').textContent = data.outdeg[i]; insp.hidden = false;
    if (sim) { sim.stimulate([i], 2.5); if (!running) toggleRun(true); }
  } else insp.hidden = true;
});

// --- simulation + stimulus controls ------------------------------------------
function toggleRun(force) {
  running = force !== undefined ? force : !running;
  $('run').textContent = running ? '❚❚ Pause' : '▶ Run brain';
  $('run').classList.toggle('act', running);
}
$('run').addEventListener('click', () => toggleRun());
const stimBtn = (id, role) => $(id).addEventListener('click', () => { if (sim) { sim.stimulateRole(role); if (!running) toggleRun(true); } });
stimBtn('stim-post', 'touchPost');
stimBtn('stim-fwd', 'fwd');
stimBtn('stim-rev', 'rev');

// PLM is the teaching moment: reveal *why* posterior touch barely moves the worm.
$('stim-post').addEventListener('click', () => {
  const note = $('plm-note');
  note.hidden = false;
  note.classList.remove('flash');   // restart the highlight animation on every click
  void note.offsetWidth;
  note.classList.add('flash');
});

$('spin').addEventListener('change', e => { controls.autoRotate = e.target.checked; });
$('edges').addEventListener('change', e => { if (edgeLines) edgeLines.visible = e.target.checked; });
$('edgeop').addEventListener('input', e => { if (edgeLines) edgeLines.material.opacity = e.target.value / 100; });
$('reset').addEventListener('click', () => { camera.position.set(...HOME); controls.target.copy(homeTarget); });

// connectome selector — rebuild the twin, and return to the 3D view
const cxSel = $('cx-select');

// Native <select> sizes to its widest option, stranding the caret in the corner. Size the
// box to the *selected* label instead (measured with the real font) so it stays snug.
function sizeSelect() {
  if (!cxSel) return;
  const label = cxSel.options[cxSel.selectedIndex]?.text || '';
  const m = document.createElement('span');
  const cs = getComputedStyle(cxSel);
  Object.assign(m.style, {
    position: 'absolute', visibility: 'hidden', whiteSpace: 'pre',
    font: cs.font, fontWeight: cs.fontWeight, letterSpacing: cs.letterSpacing,
  });
  m.textContent = label;
  document.body.appendChild(m);
  cxSel.style.width = Math.ceil(m.offsetWidth + 46) + 'px';   // text + caret + padding
  m.remove();
}
sizeSelect();

if (cxSel) cxSel.addEventListener('change', (e) => {
  sizeSelect();
  loadConnectome(e.target.value);
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'brain'));
  const p = $('panel'); if (p) { p.hidden = true; p.innerHTML = ''; }
});

resize();
