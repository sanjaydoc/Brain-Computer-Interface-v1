// BCI control plane — 3D connectome viewer (P1).
// Renders the living digital twin: neurons as instanced spheres colored by out-degree,
// synapses as faint lines. Zero-build, loads a static JSON (demo mode) — no backend.

import * as THREE from './lib/three.module.min.js';
import { OrbitControls } from './lib/OrbitControls.js';

const $ = (id) => document.getElementById(id);

// --- three-stop color ramp (template-blue → venv-green → scanner-orange) ------
const STOPS = [[0x2f, 0x6f, 0xed], [0x0e, 0x9f, 0x6e], [0xd9, 0x82, 0x18]];
function ramp(t) {
  t = Math.max(0, Math.min(1, t));
  const seg = t < 0.5 ? 0 : 1;
  const f = t < 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
  const a = STOPS[seg], b = STOPS[seg + 1];
  return [(a[0] + (b[0] - a[0]) * f) / 255,
          (a[1] + (b[1] - a[1]) * f) / 255,
          (a[2] + (b[2] - a[2]) * f) / 255];
}

const container = $('viewer');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
container.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.75));
const key = new THREE.DirectionalLight(0xffffff, 0.9);
key.position.set(1, 1, 1);
scene.add(key);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.9;

let neuronMesh = null, edgeLines = null, data = null, homeTarget = new THREE.Vector3();

function resize() {
  const w = container.clientWidth, h = container.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

fetch('./data/celegans.json').then(r => r.json()).then(build).catch(err => {
  $('loading').textContent = 'Failed to load connectome: ' + err;
});

function build(d) {
  data = d;
  $('loading').remove();
  $('cx-name').textContent = 'C. elegans';
  $('cx-neurons').textContent = d.n_neurons.toLocaleString();
  $('cx-synapses').textContent = d.n_synapses.toLocaleString();

  // center + scale positions to a friendly viewing size
  const pos = d.pos;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of pos) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
  const center = min.map((m, k) => (m + max[k]) / 2);
  const extent = Math.max(...max.map((m, k) => m - min[k]));
  const S = 170 / extent;
  // remap anatomical axes → screen: worm A-P (y) is long → screen X (horizontal);
  // dorsoventral (z) → screen Y; left-right (x) → screen Z (depth). Reads as a worm
  // laid out horizontally instead of edge-on.
  const P = pos.map(p => [
    (p[1] - center[1]) * S,
    (p[2] - center[2]) * S,
    (p[0] - center[0]) * S,
  ]);

  const maxDeg = Math.max(1, ...d.outdeg);

  // neurons — instanced spheres
  const geo = new THREE.SphereGeometry(1.5, 14, 12);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.0 });
  neuronMesh = new THREE.InstancedMesh(geo, mat, d.n_neurons);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  for (let i = 0; i < d.n_neurons; i++) {
    dummy.position.set(P[i][0], P[i][1], P[i][2]);
    dummy.updateMatrix();
    neuronMesh.setMatrixAt(i, dummy.matrix);
    const [r, g, b] = ramp(d.outdeg[i] / maxDeg);
    neuronMesh.setColorAt(i, col.setRGB(r, g, b));
  }
  neuronMesh.instanceMatrix.needsUpdate = true;
  scene.add(neuronMesh);

  // synapses — line segments
  const eg = new THREE.BufferGeometry();
  const verts = new Float32Array(d.edges.length * 6);
  d.edges.forEach(([i, j], e) => {
    verts.set([P[i][0], P[i][1], P[i][2], P[j][0], P[j][1], P[j][2]], e * 6);
  });
  eg.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  edgeLines = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({
    color: 0x333340, transparent: true, opacity: 0.18,
  }));
  scene.add(edgeLines);

  camera.position.set(10, 55, 215);
  controls.target.copy(homeTarget);
  resize();
  animate();
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

// --- picking: click a neuron to inspect --------------------------------------
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let downXY = null;
renderer.domElement.addEventListener('pointerdown', e => { downXY = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', e => {
  if (!downXY || Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]) > 4) return; // drag, not click
  const rect = renderer.domElement.getBoundingClientRect();
  ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  ray.setFromCamera(ndc, camera);
  const hit = neuronMesh ? ray.intersectObject(neuronMesh) : [];
  const insp = $('inspector');
  if (hit.length) {
    const i = hit[0].instanceId;
    $('i-id').textContent = data.ids[i];
    $('i-type').textContent = data.types[i];
    $('i-deg').textContent = data.outdeg[i];
    insp.hidden = false;
  } else {
    insp.hidden = true;
  }
});

// --- controls ----------------------------------------------------------------
$('spin').addEventListener('change', e => { controls.autoRotate = e.target.checked; });
$('edges').addEventListener('change', e => { if (edgeLines) edgeLines.visible = e.target.checked; });
$('edgeop').addEventListener('input', e => {
  if (edgeLines) edgeLines.material.opacity = e.target.value / 100;
});
$('reset').addEventListener('click', () => {
  camera.position.set(10, 55, 215);
  controls.target.copy(homeTarget);
});

resize();
