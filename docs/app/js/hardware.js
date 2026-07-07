// Hardware panel — parametric CAD for the electronics enclosure and the sensor casing.
// Real geometry: a shelled box tray (floor + 4 walls, hollow) for the electronics, or a
// cylindrical clamp ring for the ultrasound transducer / sensor. Sliders drive a live
// isometric preview and export a valid ASCII STL; the mesh is stored on the shared
// workbench so Fusion logs it and 3D-printing prints it.

import { WB } from './workbench.js';

// ---- STL geometry ------------------------------------------------------------
const quad = (a, b, c, d) => [[a, b, c], [a, c, d]];
function stl(name, tris) {
  let s = `solid ${name}\n`;
  for (const [a, b, c] of tris) {
    s += ' facet normal 0 0 0\n  outer loop\n';
    for (const p of [a, b, c]) s += `   vertex ${p[0].toFixed(3)} ${p[1].toFixed(3)} ${p[2].toFixed(3)}\n`;
    s += '  endloop\n endfacet\n';
  }
  return s + `endsolid ${name}\n`;
}
function boxTrayTris(X, Y, Z, w) {
  const O = [[0, 0, 0], [X, 0, 0], [X, Y, 0], [0, Y, 0], [0, 0, Z], [X, 0, Z], [X, Y, Z], [0, Y, Z]];
  const I = [[w, w, w], [X - w, w, w], [X - w, Y - w, w], [w, Y - w, w], [w, w, Z], [X - w, w, Z], [X - w, Y - w, Z], [w, Y - w, Z]];
  const t = [], q = (a, b, c, d) => t.push(...quad(a, b, c, d));
  q(O[0], O[3], O[2], O[1]);                                              // outer floor
  q(O[0], O[1], O[5], O[4]); q(O[1], O[2], O[6], O[5]); q(O[2], O[3], O[7], O[6]); q(O[3], O[0], O[4], O[7]);  // outer walls
  q(O[4], O[5], I[5], I[4]); q(O[5], O[6], I[6], I[5]); q(O[6], O[7], I[7], I[6]); q(O[7], O[4], I[4], I[7]);  // top rim
  q(I[4], I[5], I[1], I[0]); q(I[5], I[6], I[2], I[1]); q(I[6], I[7], I[3], I[2]); q(I[7], I[4], I[0], I[3]);  // inner walls
  q(I[0], I[1], I[2], I[3]);                                              // cavity floor
  return t;
}
function tubeTris(R, r, H, seg = 48) {
  const t = [], q = (a, b, c, d) => t.push(...quad(a, b, c, d));
  const pt = (rad, k, z) => [rad * Math.cos(2 * Math.PI * k / seg), rad * Math.sin(2 * Math.PI * k / seg), z];
  for (let k = 0; k < seg; k++) {
    const k1 = (k + 1) % seg;
    q(pt(R, k, 0), pt(R, k1, 0), pt(R, k1, H), pt(R, k, H));   // outer wall
    q(pt(r, k, H), pt(r, k1, H), pt(r, k1, 0), pt(r, k, 0));   // inner wall
    q(pt(R, k, H), pt(R, k1, H), pt(r, k1, H), pt(r, k, H));   // top ring
    q(pt(r, k, 0), pt(r, k1, 0), pt(R, k1, 0), pt(R, k, 0));   // bottom ring
  }
  return t;
}

// ---- isometric preview -------------------------------------------------------
function iso(x, y, z, cx, cy, s) {
  return [cx + (x - y) * 0.87 * s, cy + ((x + y) * 0.5 - z) * s];
}
function previewBox(X, Y, Z) {
  const s = Math.min(120 / (X + Y), 120 / (X + Y), 3.2), cx = 200, cy = 210;
  const P = (x, y, z) => iso(x - X / 2, y - Y / 2, z, cx, cy, s);
  const c = [P(0, 0, 0), P(X, 0, 0), P(X, Y, 0), P(0, Y, 0), P(0, 0, Z), P(X, 0, Z), P(X, Y, Z), P(0, Y, Z)];
  const line = (a, b, w = 1.5, col = '#2b2b33') => `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="${col}" stroke-width="${w}"/>`;
  const face = (i, j, k, l, fill) => `<polygon points="${[c[i], c[j], c[k], c[l]].map((p) => p.join(',')).join(' ')}" fill="${fill}" stroke="#2b2b33" stroke-width="1"/>`;
  return `<svg viewBox="0 0 400 340" class="sch-svg">
    ${face(4, 5, 6, 7, 'rgba(47,111,237,0.10)')}${face(1, 2, 6, 5, 'rgba(47,111,237,0.18)')}${face(2, 3, 7, 6, 'rgba(47,111,237,0.13)')}
    ${line(c[0], c[1])}${line(c[1], c[2])}${line(c[2], c[3])}${line(c[3], c[0])}
    ${line(c[4], c[5])}${line(c[5], c[6])}${line(c[6], c[7])}${line(c[7], c[4])}
    ${line(c[0], c[4])}${line(c[1], c[5])}${line(c[2], c[6])}${line(c[3], c[7])}</svg>`;
}
function previewRing(R, H) {
  const cx = 200, cy = 200, s = Math.min(120 / R, 2.6), rx = R * s, ry = R * s * 0.5, h = H * s;
  return `<svg viewBox="0 0 400 340" class="sch-svg">
    <ellipse cx="${cx}" cy="${cy + h}" rx="${rx}" ry="${ry}" fill="rgba(47,111,237,0.15)" stroke="#2b2b33"/>
    <line x1="${cx - rx}" y1="${cy}" x2="${cx - rx}" y2="${cy + h}" stroke="#2b2b33" stroke-width="1.5"/>
    <line x1="${cx + rx}" y1="${cy}" x2="${cx + rx}" y2="${cy + h}" stroke="#2b2b33" stroke-width="1.5"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="rgba(47,111,237,0.22)" stroke="#2b2b33"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx * 0.6}" ry="${ry * 0.6}" fill="var(--paper,#fff)" stroke="#2b2b33"/></svg>`;
}

// a ready-made default enclosure, so 3D printing works even before you open Hardware
export function defaultEnclosure() {
  const X = 60, Y = 40, Z = 18, w = 2;
  const vol = (X * Y * Z - (X - 2 * w) * (Y - 2 * w) * (Z - w)) / 1000;
  return { kind: 'enclosure', w: X, h: Z, d: Y, wall: w, vol, size: `${X}×${Y}×${Z} mm`,
    stl: stl('bci_enclosure', boxTrayTris(X, Y, Z, w)), name: 'bci_enclosure.stl' };
}

export function renderHardware(el) {
  el.classList.add('stage');
  // default the electronics enclosure to fit the current circuit's part count
  const parts = WB.circuit ? WB.circuit.components.length : 6;
  const dims = { X: Math.max(50, 22 + parts * 8), Y: 40, Z: 18, wall: 2, R: 16, r: 12, H: 14, kind: 'enclosure' };

  el.innerHTML = `
    <div class="sch-stage" id="hw-preview"></div>
    <div class="overlay stats" style="max-width:280px">
      <div class="eyebrow">Hardware · part</div>
      <h3 id="hw-name">Electronics enclosure</h3>
      <div class="statrow"><span>outer size</span><b id="hw-size">—</b></div>
      <div class="statrow"><span>wall</span><b id="hw-wallv">—</b></div>
      <div class="statrow"><span>volume (material)</span><b id="hw-vol">—</b></div>
      <div class="statrow"><span>est. mass @ 20% PLA</span><b id="hw-mass">—</b></div>
      <button class="btn act" id="hw-export" style="margin-top:.5rem">⬇ Export .stl</button>
      <div class="muted small" id="hw-msg">Watertight ASCII-STL — opens in any slicer. Stored for Fusion & 3D printing.</div>
    </div>
    <div class="overlay controls">
      <div class="eyebrow">📦 parametric CAD</div>
      <label class="field">part
        <select id="hw-kind"><option value="enclosure">electronics enclosure (box)</option><option value="sensor">sensor / transducer casing (ring)</option></select></label>
      <div id="hw-box">
        <label class="ctl">width <input id="hw-X" type="range" min="30" max="140" step="1" value="${dims.X}"><span id="hw-X-v">${dims.X}</span></label>
        <label class="ctl">depth <input id="hw-Y" type="range" min="30" max="120" step="1" value="${dims.Y}"><span id="hw-Y-v">${dims.Y}</span></label>
        <label class="ctl">height <input id="hw-Z" type="range" min="10" max="60" step="1" value="${dims.Z}"><span id="hw-Z-v">${dims.Z}</span></label>
        <label class="ctl">wall <input id="hw-wall" type="range" min="1" max="4" step="0.5" value="${dims.wall}"><span id="hw-wall-v">${dims.wall}</span></label>
      </div>
      <div id="hw-ring" hidden>
        <label class="ctl">outer R <input id="hw-R" type="range" min="8" max="40" step="1" value="${dims.R}"><span id="hw-R-v">${dims.R}</span></label>
        <label class="ctl">bore r <input id="hw-r" type="range" min="4" max="36" step="1" value="${dims.r}"><span id="hw-r-v">${dims.r}</span></label>
        <label class="ctl">height <input id="hw-H" type="range" min="6" max="40" step="1" value="${dims.H}"><span id="hw-H-v">${dims.H}</span></label>
      </div>
      <div class="muted small">Enclosure width auto-fits the current circuit (${parts} parts). The ring is a clamp for the transducer with an acoustic window (the bore).</div>
    </div>`;

  const $ = (id) => el.querySelector(`#hw-${id}`);
  const val = (id) => +$(id).value;
  const link = (id) => { $(id).addEventListener('input', () => { $(`${id}-v`).textContent = $(id).value; update(); }); };
  ['X', 'Y', 'Z', 'wall', 'R', 'r', 'H'].forEach(link);

  function build() {
    if (dims.kind === 'enclosure') {
      const X = val('X'), Y = val('Y'), Z = val('Z'), w = val('wall');
      const vol = (X * Y * Z - Math.max(0, X - 2 * w) * Math.max(0, Y - 2 * w) * Math.max(0, Z - w)) / 1000;  // cm³ of walls
      return { name: 'Electronics enclosure', size: `${X}×${Y}×${Z} mm`, wall: `${w} mm`, vol,
        tris: boxTrayTris(X, Y, Z, w), preview: previewBox(X, Y, Z), stlName: 'bci_enclosure.stl',
        rec: { kind: 'enclosure', w: X, h: Z, d: Y, wall: w } };
    }
    const R = val('R'), r = Math.min(val('r'), val('R') - 1), H = val('H');
    const vol = Math.PI * (R * R - r * r) * H / 1000;
    return { name: 'Sensor / transducer casing', size: `Ø${2 * R}×${H} mm, bore Ø${2 * r}`, wall: `${R - r} mm`, vol,
      tris: tubeTris(R, r, H), preview: previewRing(R, H), stlName: 'bci_sensor_mount.stl',
      rec: { kind: 'sensor', w: 2 * R, h: H, d: 2 * R, wall: R - r } };
  }

  function update() {
    const b = build();
    el.querySelector('#hw-preview').innerHTML = b.preview;
    $('name').textContent = b.name; $('size').textContent = b.size; $('wallv').textContent = b.wall;
    $('vol').textContent = `${b.vol.toFixed(1)} cm³`;
    $('mass').textContent = `${(b.vol * 1.24 * 0.2).toFixed(1)} g`;   // PLA 1.24 g/cm³, 20% infill
    WB.enclosure = { ...b.rec, vol: b.vol, size: b.size, stl: stl(b.name, b.tris), name: b.stlName };
  }

  $('kind').addEventListener('change', () => {
    dims.kind = $('kind').value;
    $('box').hidden = dims.kind !== 'enclosure';
    $('ring').hidden = dims.kind !== 'sensor';
    update();
  });
  $('export').addEventListener('click', () => {
    const e = WB.enclosure; if (!e) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([e.stl], { type: 'model/stl' }));
    a.download = e.name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
    $('msg').textContent = `Exported ${e.name} · ${(e.stl.match(/facet/g) || []).length} triangles.`;
  });
  update();
}
