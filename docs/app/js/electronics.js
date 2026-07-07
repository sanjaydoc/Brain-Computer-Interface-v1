// Electronics panel — concept → schematic + BOM, in the cockpit view.
// Live mode calls the Python backend (/api/electronics, ported from inventor-studio-v3).
// Demo mode (hosted, no backend) runs the same rule-based composer in the browser, so the
// tab works standalone. Renders an SVG schematic (components placed by x/y, wires coloured
// by power/data) plus the bill of materials, and a generated PCB layout. Scroll to zoom.

import { WB } from './workbench.js';

const COLS = { POWER: 50, ACTUATOR: 280, MCU: 510, SENSOR: 740, MODULE: 970, DISPLAY: 970 };
const CAT_COLOR = { MCU: '#2b2b33', POWER: '#0e9f6e', SENSOR: '#2f6fed', ACTUATOR: '#d98218', DISPLAY: '#7a5bd0', MODULE: '#6b7280' };

let _live = null;
async function detectLive() {
  if (_live !== null) return _live;
  try {
    const b = await fetch('/api/electronics/backends').then((r) => r.ok ? r.json() : null);
    _live = b && (b.llm || b.fallback === false) ? b : false;   // only claim "live" if an LLM is wired
  } catch { _live = false; }
  return _live;
}

// match at a word start (prefix of a real word) — not an interior substring, so "imu" does
// NOT false-match "st-imu-lator".
const has = (t, ...w) => w.some((x) => new RegExp('\\b' + x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(t));

// Rule-based composer — a faithful JS port of backend/bci/electronics/compose.py so demo
// mode produces the same shape of circuit the API would.
function composeCircuit(concept) {
  const t = (concept || '').toLowerCase();
  const comps = [], conns = [], rows = {};
  const place = (cat) => {
    const y = cat === 'MCU' ? 250 : 60 + (rows[cat] || 0) * 150;
    rows[cat] = (rows[cat] || 0) + 1;
    return [COLS[cat] ?? 970, y];
  };
  const add = (id, type, cat, name, model, specs, pins, qty = 1) => {
    const [x, y] = place(cat);
    comps.push({ id, type, category: cat, name, model, specs, quantity: qty, pins, x, y });
    return id;
  };
  const wire = (from, fromPin, to, toPin, type, label = '') => conns.push({ from, fromPin, to, toPin, type, label });
  const i2c = (dev) => { wire('U1', 'SDA', dev, 'SDA', 'data', 'I2C'); wire('U1', 'SCL', dev, 'SCL', 'data', 'I2C'); wire('PM1', 'VOUT', dev, 'VCC', 'power', '3V3'); wire('BAT1', 'GND', dev, 'GND', 'power', 'GND'); };

  let mcuV;
  if (has(t, 'esp32', 'wifi', 'wireless', 'iot', 'ble', 'bluetooth')) { mcuV = '3V3'; add('U1', 'esp32', 'MCU', 'Microcontroller', 'ESP32-S3', '240MHz Wi-Fi/BLE', ['3V3', 'GND', 'SDA', 'SCL', 'SPI', 'IO']); }
  else if (has(t, 'stm32')) { mcuV = '3V3'; add('U1', 'stm32', 'MCU', 'Microcontroller', 'STM32F411', '100MHz Cortex-M4', ['3V3', 'GND', 'SDA', 'SCL', 'SPI', 'IO']); }
  else { mcuV = '5V'; add('U1', 'arduino', 'MCU', 'Microcontroller', 'Arduino Nano', 'ATmega328P 5V', ['5V', 'GND', 'SDA', 'SCL', 'D2', 'D9']); }

  add('BAT1', 'battery', 'POWER', 'Power Supply', 'Li-Po 3.7V', '1200mAh + protection', ['V+', 'GND']);
  add('PM1', 'buck_converter', 'POWER', 'Regulator', `${mcuV} buck`, 'AP2112 500mA', ['VIN', 'VOUT', 'GND']);
  wire('BAT1', 'V+', 'PM1', 'VIN', 'power', '3.7V'); wire('PM1', 'VOUT', 'U1', mcuV, 'power', mcuV); wire('BAT1', 'GND', 'U1', 'GND', 'power', 'GND');

  let io = false;
  if (has(t, 'eeg', 'ecg', 'emg', 'brain', 'bci', 'electrode', 'neural', 'neuro', 'sono', 'dust', 'cortex')) {
    add('AFE1', 'sensor', 'SENSOR', 'Bio-AFE', 'ADS1299', '8-ch 24-bit ΔΣ', ['IN+', 'IN-', 'SCLK', 'MISO', 'DRDY', 'VCC', 'GND']);
    add('J1', 'module', 'MODULE', 'Electrode array', '8-ch header', 'dry/wet electrodes', ['E1', 'E8', 'REF']);
    add('STIM1', 'transistor', 'ACTUATOR', 'Stimulator', 'constant-current', '±5V bipolar', ['CTRL', 'OUT+', 'OUT-']);
    add('US1', 'transistor', 'ACTUATOR', 'Ultrasound driver', 'MOSFET H-bridge', 'sonogenetics write', ['CTRL', 'XDCR']);
    wire('J1', 'E1', 'AFE1', 'IN+', 'data', 'electrodes'); wire('J1', 'REF', 'AFE1', 'IN-', 'data', 'ref');
    wire('AFE1', 'SCLK', 'U1', 'SPI', 'data', 'SPI'); wire('AFE1', 'MISO', 'U1', 'SPI', 'data', 'SPI'); wire('AFE1', 'DRDY', 'U1', 'IO', 'data', 'DRDY');
    wire('U1', 'IO', 'STIM1', 'CTRL', 'data', 'stim ctrl'); wire('U1', 'IO', 'US1', 'CTRL', 'data', 'US ctrl');
    wire('PM1', 'VOUT', 'AFE1', 'VCC', 'power', mcuV); wire('BAT1', 'GND', 'AFE1', 'GND', 'power', 'GND');
    io = true;
  }
  if (has(t, 'temp', 'thermo', 'climate')) { add('T1', 'sensor_temp', 'SENSOR', 'Temperature', 'BMP280', 'temp/pressure I2C', ['VCC', 'GND', 'SDA', 'SCL']); i2c('T1'); io = true; }
  if (has(t, 'imu', 'motion', 'accel', 'gyro', 'gesture', 'orientation')) { add('IMU1', 'sensor_imu', 'SENSOR', 'IMU', 'MPU-6050', '6-axis I2C', ['VCC', 'GND', 'SDA', 'SCL']); i2c('IMU1'); io = true; }
  if (has(t, 'distance', 'ultrasonic', 'proximity', 'range', 'obstacle')) {
    add('D1', 'sensor_distance', 'SENSOR', 'Distance', 'HC-SR04', 'ultrasonic 2-400cm', ['VCC', 'GND', 'TRIG', 'ECHO']);
    wire('U1', 'D2', 'D1', 'TRIG', 'data', 'TRIG'); wire('D1', 'ECHO', 'U1', 'IO', 'data', 'ECHO'); wire('PM1', 'VOUT', 'D1', 'VCC', 'power', mcuV); wire('BAT1', 'GND', 'D1', 'GND', 'power', 'GND'); io = true;
  }
  if (has(t, 'servo')) { add('SV1', 'motor_servo', 'ACTUATOR', 'Servo', 'SG90', '9g PWM servo', ['VCC', 'GND', 'SIG']); wire('U1', 'D9', 'SV1', 'SIG', 'data', 'PWM'); wire('BAT1', 'V+', 'SV1', 'VCC', 'power', '5V'); wire('BAT1', 'GND', 'SV1', 'GND', 'power', 'GND'); io = true; }
  if (has(t, 'motor', 'wheel', 'drive', 'pump', 'fan')) {
    add('DRV1', 'module', 'MODULE', 'Motor driver', 'L298N', 'dual H-bridge', ['IN1', 'IN2', 'OUT1', 'OUT2', 'VCC']);
    add('M1', 'motor_dc', 'ACTUATOR', 'DC Motor', 'N20 gearmotor', '6V', ['+', '-']);
    wire('U1', 'D2', 'DRV1', 'IN1', 'data', 'PWM'); wire('U1', 'D9', 'DRV1', 'IN2', 'data', 'DIR'); wire('DRV1', 'OUT1', 'M1', '+', 'power', ''); wire('DRV1', 'OUT2', 'M1', '-', 'power', ''); wire('BAT1', 'V+', 'DRV1', 'VCC', 'power', '3.7V'); io = true;
  }
  if (has(t, 'oled', 'display', 'screen', 'lcd')) { add('OL1', 'oled', 'DISPLAY', 'Display', 'SSD1306 OLED', '128x64 I2C', ['VCC', 'GND', 'SDA', 'SCL']); i2c('OL1'); io = true; }
  if (!io || has(t, 'led', 'light', 'blink', 'indicator')) {
    add('R1', 'resistor', 'MODULE', 'Current-limit resistor', '220Ω 1/4W', '220 ohm', ['1', '2']);
    add('LED1', 'led', 'DISPLAY', 'LED', 'Red 5mm', '2V 20mA', ['A', 'K']);
    wire('U1', 'D9', 'R1', '1', 'data', ''); wire('R1', '2', 'LED1', 'A', 'data', ''); wire('LED1', 'K', 'U1', 'GND', 'power', 'GND');
  }
  return { title: (concept || '').trim().slice(0, 80) || 'Custom circuit', description: (concept || '').trim(), components: comps, connections: conns };
}

function sanitize(cd) {
  const comps = (cd.components || []).map((c, i) => ({ ...c, id: String(c.id || `C${i + 1}`).trim() }));
  const ids = new Set(comps.map((c) => c.id));
  const seen = new Set();
  const conns = (cd.connections || []).map((c) => ({
    from: String(c.from || '').trim(), to: String(c.to || '').trim(), fromPin: String(c.fromPin || '').trim(),
    toPin: String(c.toPin || '').trim(), type: c.type === 'power' ? 'power' : 'data', label: String(c.label || '').slice(0, 40),
  })).filter((c) => c.from && c.to && c.from !== c.to && ids.has(c.from) && ids.has(c.to))
    .filter((c) => { const k = `${c.from}→${c.to}`; if (seen.has(k)) return false; seen.add(k); return true; });
  return { ...cd, components: comps, connections: conns, bom: comps.map((c) => ({ ...c })) };
}

function schematicSVG(circuit) {
  const nodes = circuit.components, W = 150, H = 60;
  const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y);
  const minX = Math.min(...xs) - 30, maxX = Math.max(...xs) + W + 30;
  const minY = Math.min(...ys) - 30, maxY = Math.max(...ys) + H + 40;
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const cx = (n) => n.x + W / 2, cy = (n) => n.y + H / 2;

  const edges = circuit.connections.map((e) => {
    const a = byId[e.from], b = byId[e.to]; if (!a || !b) return '';
    const col = e.type === 'power' ? '#0e9f6e' : '#2f6fed';
    const mx = (cx(a) + cx(b)) / 2, my = (cy(a) + cy(b)) / 2;
    return `<line x1="${cx(a)}" y1="${cy(a)}" x2="${cx(b)}" y2="${cy(b)}" stroke="${col}" stroke-width="2" stroke-opacity="0.6"${e.type === 'power' ? '' : ' stroke-dasharray="6 4"'}/>`
      + (e.label ? `<text x="${mx}" y="${my - 3}" fill="${col}" font-size="10" text-anchor="middle" font-family="ui-monospace,monospace">${e.label}</text>` : '');
  }).join('');

  const boxes = nodes.map((n) => {
    const col = CAT_COLOR[n.category] || '#6b7280';
    return `<g>
      <rect x="${n.x}" y="${n.y}" width="${W}" height="${H}" rx="8" fill="#fff" stroke="${col}" stroke-width="2"/>
      <rect x="${n.x}" y="${n.y}" width="6" height="${H}" rx="3" fill="${col}"/>
      <text x="${n.x + 14}" y="${n.y + 20}" font-size="12" font-weight="700" fill="#1a1a1f" font-family="ui-sans-serif,system-ui">${n.id} · ${n.name}</text>
      <text x="${n.x + 14}" y="${n.y + 37}" font-size="11" fill="#555" font-family="ui-sans-serif,system-ui">${n.model}</text>
      <text x="${n.x + 14}" y="${n.y + 51}" font-size="9.5" fill="#8a8a92" font-family="ui-monospace,monospace">${n.category} · ${n.specs}</text>
    </g>`;
  }).join('');

  return `<svg class="sch-svg" viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" preserveAspectRatio="xMidYMid meet">${edges}${boxes}</svg>`;
}

// PCB auto-layout: place components on a board grid, give each a footprint with pads, and
// route each net as a 2-layer orthogonal copper trace (power = wide, data = thin). A real
// (if simple) place-and-route from the same components + connections the schematic uses.
function pcbSVG(circuit) {
  const comps = circuit.components, n = comps.length;
  const cols = Math.max(2, Math.ceil(Math.sqrt(n))), rows = Math.ceil(n / cols);
  const cell = 74, mgn = 34, boardW = mgn * 2 + cols * cell, boardH = mgn * 2 + rows * cell;
  const nodes = {};
  const list = comps.map((c, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const pins = Math.min(8, Math.max(2, (c.pins || []).length));
    const fw = Math.max(36, 8 + pins * 7), fh = 30;
    const bx = mgn + col * cell + (cell - fw) / 2, by = mgn + row * cell + (cell - fh) / 2;
    const pads = Array.from({ length: pins }, (_, k) => ({ x: bx + fw * (k + 1) / (pins + 1), y: by + fh + 3 }));
    const node = { ...c, bx, by, fw, fh, pads, cx: bx + fw / 2, cy: by + fh / 2 };
    nodes[c.id] = node; return node;
  });
  const nearestPad = (node, toward) => node.pads.reduce((best, p) =>
    (p.x - toward.cx) ** 2 + (p.y - toward.cy) ** 2 < (best.x - toward.cx) ** 2 + (best.y - toward.cy) ** 2 ? p : best, node.pads[0]);
  const traces = circuit.connections.map((e, idx) => {
    const a = nodes[e.from], b = nodes[e.to]; if (!a || !b) return '';
    const pa = nearestPad(a, b), pb = nearestPad(b, a);
    const col = e.type === 'power' ? '#e0654a' : '#43a7ff', w = e.type === 'power' ? 3.2 : 2;
    const midY = (pa.y + pb.y) / 2 + (idx % 2 ? 9 : -9);   // 2-layer offset so traces don't overlap
    return `<path d="M ${pa.x} ${pa.y} L ${pa.x} ${midY} L ${pb.x} ${midY} L ${pb.x} ${pb.y}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linejoin="round" opacity="0.9"/>`;
  }).join('');
  const pads = list.map((nd) => nd.pads.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="2.7" fill="#e8c24a"/>`).join('')).join('');
  const foot = list.map((nd) => `<g>
    <rect x="${nd.bx}" y="${nd.by}" width="${nd.fw}" height="${nd.fh}" rx="3" fill="#0c3b2e" stroke="#e8c24a" stroke-width="1"/>
    <text x="${nd.cx}" y="${nd.by + nd.fh / 2 + 3.5}" text-anchor="middle" font-size="10" font-weight="700" fill="#e6f6ee" font-family="ui-monospace,monospace">${nd.id}</text></g>`).join('');
  const holes = [[mgn / 2, mgn / 2], [boardW - mgn / 2, mgn / 2], [mgn / 2, boardH - mgn / 2], [boardW - mgn / 2, boardH - mgn / 2]]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.5" fill="#0a2a20" stroke="#e8c24a" stroke-width="1.2"/>`).join('');
  return `<svg class="sch-svg" viewBox="-12 -12 ${boardW + 24} ${boardH + 30}" preserveAspectRatio="xMidYMid meet">
    <rect x="0" y="0" width="${boardW}" height="${boardH}" rx="7" fill="#0e4d3a"/>
    <rect x="5" y="5" width="${boardW - 10}" height="${boardH - 10}" rx="4" fill="none" stroke="#1c6b52"/>
    ${traces}${pads}${foot}${holes}
    <text x="${boardW / 2}" y="${boardH + 16}" text-anchor="middle" font-size="11" fill="#7a9a8c" font-family="ui-sans-serif,system-ui">${boardW} × ${boardH} mm · ${circuit.connections.length} nets · 2-layer</text></svg>`;
}

// mouse-scroll zoom (toward the cursor) + drag-pan on an SVG, by mutating its viewBox
export function attachPanZoom(stage) {
  const svg = stage.querySelector('svg'); if (!svg) return;
  let vb = (svg.getAttribute('viewBox') || '0 0 100 100').split(/\s+/).map(Number);
  const base = [...vb], apply = () => svg.setAttribute('viewBox', vb.join(' '));
  svg.style.cursor = 'grab';
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = svg.getBoundingClientRect();
    const mx = (e.clientX - r.left) / r.width, my = (e.clientY - r.top) / r.height;
    const px = vb[0] + mx * vb[2], py = vb[1] + my * vb[3];
    let nw = vb[2] * (e.deltaY < 0 ? 0.86 : 1.16);
    nw = Math.max(base[2] * 0.12, Math.min(base[2] * 1.7, nw));
    const nh = nw * (base[3] / base[2]);
    vb = [px - mx * nw, py - my * nh, nw, nh]; apply();
  }, { passive: false });
  let drag = null;
  svg.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, vb: [...vb] }; svg.setPointerCapture(e.pointerId); svg.style.cursor = 'grabbing'; });
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return; const r = svg.getBoundingClientRect();
    vb[0] = drag.vb[0] - (e.clientX - drag.x) / r.width * vb[2];
    vb[1] = drag.vb[1] - (e.clientY - drag.y) / r.height * vb[3]; apply();
  });
  const end = () => { drag = null; svg.style.cursor = 'grab'; };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
}

export async function renderElectronics(el) {
  const live = await detectLive();
  const badge = live ? `<span class="chip allow">live · ${live.llm ? 'LLM' : 'backend'}</span>` : '<span class="chip">demo · in-browser composer</span>';
  el.classList.add('stage');
  el.innerHTML = `
    <div class="sch-stage" id="el-stage"><div class="muted" style="margin:auto">Describe a circuit and press Generate.</div></div>
    <div class="overlay stats" id="el-bom-card" style="max-width:300px">
      <div class="eyebrow">Electronics · BOM</div>
      <h3 id="el-title">—</h3>
      <div class="panel-card-list" id="el-bom"><div class="muted small">The bill of materials appears here.</div></div>
    </div>
    <div class="overlay controls">
      <div class="eyebrow">🔌 Schematic generator ${badge}</div>
      <label class="field">concept
        <input id="el-concept" type="text" value="EEG BCI headset with 8 electrodes + stimulator" style="text-transform:none" /></label>
      <div class="muted small" style="margin:-.2rem 0 .1rem">try: “ESP32 neural node with IMU + OLED”, “motor driver robot”, “ECG monitor”</div>
      <button class="btn act" id="el-gen">▶ Generate</button>
      <div class="seg" style="margin-top:.2rem">
        <button class="seg-btn active" data-b="schematic">schematic</button>
        <button class="seg-btn" data-b="pcb">PCB layout</button>
      </div>
      <div class="muted small" id="el-note">Ported from <b>inventor-studio-v3</b> (Node → Python). ${live ? 'Live LLM generation.' : 'Demo runs the rule-based composer in your browser; the LLM path activates with a backend + API key.'} <b>Scroll to zoom</b>, drag to pan.</div>
    </div>`;

  const stage = el.querySelector('#el-stage');
  let circuit = null, view = 'schematic';

  const renderView = () => {
    if (!circuit) return;
    stage.innerHTML = view === 'pcb' ? pcbSVG(circuit) : schematicSVG(circuit);
    attachPanZoom(stage);
  };

  const run = async () => {
    const concept = el.querySelector('#el-concept').value.trim();
    if (!concept) return;
    stage.innerHTML = '<div class="muted" style="margin:auto">Generating…</div>';
    try {
      if (live) circuit = await fetch('/api/electronics/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ concept }),
      }).then((r) => r.json());
      else circuit = sanitize(composeCircuit(concept));
    } catch { circuit = sanitize(composeCircuit(concept)); }
    WB.circuit = circuit;
    renderView();
    el.querySelector('#el-title').textContent = circuit.title || concept.slice(0, 40);
    const bom = circuit.bom || circuit.components;
    el.querySelector('#el-bom').innerHTML = `<table class="mini"><tbody>${bom.map((c) =>
      `<tr><td><b>${c.id}</b></td><td>${c.name}</td><td class="muted">${c.model}</td></tr>`).join('')}</tbody></table>`
      + `<div class="muted small" style="margin-top:.3rem">${circuit.components.length} parts · ${circuit.connections.length} nets`
      + `${circuit.backend ? ` · ${circuit.backend}` : ''}${circuit.note ? ` (${circuit.note})` : ''}</div>`;
  };

  el.querySelector('#el-gen').addEventListener('click', run);
  el.querySelector('#el-concept').addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
  el.querySelectorAll('.seg-btn').forEach((b) => b.addEventListener('click', () => {
    el.querySelectorAll('.seg-btn').forEach((x) => x.classList.toggle('active', x === b));
    view = b.dataset.b; renderView();
  }));
  run();   // generate the default concept immediately
}
