// Fusion + 3D printing panels — the end of the pipeline.
// Fusion combines everything on the workbench (connectome · channel · wave · circuit ·
// enclosure), runs a real assay experiment on the live connectome, and logs each result to a
// data table you can export as CSV. 3D printing takes the enclosure mesh Hardware produced,
// estimates the print, exports the STL, and simulates streaming it to a printer.

import { TestBench } from './testbench.js';
import { channelSpec, chanType } from './molecular.js';
import { defaultEnclosure } from './hardware.js';
import { WB } from './workbench.js';

// ---------- Fusion ------------------------------------------------------------
let fuBench = null;
export function stopFusion() { if (fuBench) { fuBench.stop(); fuBench = null; } }

function tableHTML() {
  if (!WB.results.length) return '<div class="muted small">Run an experiment to log the first result.</div>';
  const head = ['#', 'connectome', 'channel', 'wave', 'direction', 'score', 'parts', 'enclosure'];
  return `<table class="mini"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>`
    + WB.results.map((r) => `<tr><td>${r.i}</td><td>${r.connectome}</td><td>${r.channel}</td><td>${r.wave}</td>`
      + `<td><span class="chip ${r.direction === 'excited' ? 'ok' : r.direction === 'suppressed' ? 'no' : ''}">${r.direction}</span></td>`
      + `<td>${r.score}</td><td>${r.parts}</td><td class="muted">${r.enclosure}</td></tr>`).join('')
    + '</tbody></table>';
}

export function renderFusion(el) {
  el.classList.add('stage');
  const data = window.__connectome;
  el.innerHTML = `
    <canvas id="fu-canvas" class="stage-canvas"></canvas>
    <div class="overlay stats" style="max-width:430px">
      <div class="eyebrow">Fusion · results</div>
      <h3>Experiment log</h3>
      <div class="panel-card-list" id="fu-table" style="max-height:46vh">${tableHTML()}</div>
      <div style="display:flex;gap:.4rem;margin-top:.5rem">
        <button class="btn" id="fu-csv">⬇ Export CSV</button>
        <button class="btn" id="fu-clear">clear</button>
      </div>
    </div>
    <div class="overlay controls">
      <div class="eyebrow">🧩 combine &amp; run</div>
      <div class="statrow"><span>connectome</span><b>${data ? data.name : '—'}</b></div>
      <div class="statrow"><span>channel</span><b id="fu-ch">${WB.channel ? chanType(WB.channel) : 'default (aspirin)'}</b></div>
      <div class="statrow"><span>wave</span><b>${WB.wave ? WB.wave.form : 'pulse'}</b></div>
      <div class="statrow"><span>circuit</span><b>${WB.circuit ? WB.circuit.components.length + ' parts' : '—'}</b></div>
      <div class="statrow"><span>enclosure</span><b>${WB.enclosure ? WB.enclosure.size : '—'}</b></div>
      <button class="btn act" id="fu-run" style="margin-top:.6rem">▶ Run experiment</button>
      <div class="muted small">Writes the current channel + wave to the connectome, reads the response, and appends a row. Set the channel in <b>Physics/Biomolecules</b>, the wave in <b>Waves</b>, the case in <b>Hardware</b>.</div>
    </div>`;

  const canvas = el.querySelector('#fu-canvas');
  const run = () => {
    if (!data) return;
    stopFusion();
    const cs = WB.channel || { ...channelSpec('CC(=O)Oc1ccccc1C(=O)O', 'smiles'), sequence: 'aspirin' };
    const ch = { id: 'fusion', sensitivity: cs.sensitivity, conductance: cs.conductance, sign: cs.sign, target: '', locus: cs.locus || [0.5, 0.45] };
    fuBench = new TestBench(canvas, data, ch, (r) => {
      WB.results.push({
        i: WB.results.length + 1, connectome: data.name || '—', channel: chanType(cs),
        wave: WB.wave ? WB.wave.form : 'pulse', direction: r.direction, score: r.score,
        parts: WB.circuit ? WB.circuit.components.length : '—', enclosure: WB.enclosure ? WB.enclosure.size : '—',
      });
      el.querySelector('#fu-table').innerHTML = tableHTML();
    });
    requestAnimationFrame(() => { fuBench.resize(); fuBench.start(); });
  };
  el.querySelector('#fu-run').addEventListener('click', run);
  el.querySelector('#fu-clear').addEventListener('click', () => { WB.results = []; el.querySelector('#fu-table').innerHTML = tableHTML(); });
  el.querySelector('#fu-csv').addEventListener('click', () => {
    const cols = ['i', 'connectome', 'channel', 'wave', 'direction', 'score', 'parts', 'enclosure'];
    const csv = [cols.join(','), ...WB.results.map((r) => cols.map((c) => `"${r[c]}"`).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'bci_fusion_results.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  });
  return { stop: stopFusion };
}

// ---------- 3D printing -------------------------------------------------------
const MAT = { PLA: 1.24, PETG: 1.27, ABS: 1.04 };   // g/cm³

export function renderPrint(el) {
  el.classList.add('stage');
  if (!WB.enclosure) WB.enclosure = defaultEnclosure();
  const e = WB.enclosure;
  el.innerHTML = `
    <div class="sch-stage" id="pr-bed"></div>
    <div class="overlay stats" style="max-width:280px">
      <div class="eyebrow">3D printing · file</div>
      <h3 id="pr-name">${e.name}</h3>
      <div class="statrow"><span>from</span><b>Hardware / Fusion</b></div>
      <div class="statrow"><span>size</span><b>${e.size || '—'}</b></div>
      <div class="statrow"><span>triangles</span><b>${(e.stl.match(/facet/g) || []).length}</b></div>
      <div class="statrow"><span>est. mass</span><b id="pr-mass">—</b></div>
      <div class="statrow"><span>filament</span><b id="pr-fil">—</b></div>
      <div class="statrow"><span>est. time</span><b id="pr-time">—</b></div>
    </div>
    <div class="overlay controls">
      <div class="eyebrow">🖨️ print</div>
      <label class="field">material <select id="pr-mat"><option>PLA</option><option>PETG</option><option>ABS</option></select></label>
      <label class="ctl">layer height <input id="pr-layer" type="range" min="0.1" max="0.3" step="0.05" value="0.2"><span id="pr-layer-v">0.2</span> mm</label>
      <label class="ctl">infill <input id="pr-infill" type="range" min="10" max="60" step="5" value="20"><span id="pr-infill-v">20</span>%</label>
      <button class="btn act" id="pr-stl">⬇ Download .stl</button>
      <button class="btn act" id="pr-send">📡 Send to printer</button>
      <div class="muted small" id="pr-msg">Real STL export. “Send” simulates streaming — wire OctoPrint/USB for a live printer.</div>
    </div>`;

  const $ = (id) => el.querySelector(`#pr-${id}`);
  const est = () => {
    const dens = MAT[$('mat').value] || 1.24, infill = +$('infill').value / 100, layer = +$('layer').value;
    const mass = e.vol * dens * (0.35 + 0.65 * infill);        // shell + infill fraction
    const fil = mass / dens / 0.02405 / 100;                    // m of 1.75 mm filament
    const mins = (e.vol * (0.35 + 0.65 * infill)) * (0.2 / layer) * 4.2;
    $('mass').textContent = `${mass.toFixed(1)} g`;
    $('fil').textContent = `${fil.toFixed(2)} m`;
    $('time').textContent = `${Math.floor(mins / 60)}h ${Math.round(mins % 60)}m`;
    drawBed(0);
  };
  const drawBed = (progress) => {
    const bx = e.w || 60, by = e.d || 40, s = Math.min(300 / 220, 3), W = bx * s, H = by * s;
    const fill = Math.max(0, Math.min(1, progress));
    el.querySelector('#pr-bed').innerHTML = `<svg viewBox="0 0 400 340" class="sch-svg">
      <rect x="70" y="70" width="260" height="200" rx="4" fill="none" stroke="#bbb" stroke-dasharray="5 4"/>
      <rect x="${200 - W / 2}" y="${170 - H / 2}" width="${W}" height="${H}" rx="4" fill="rgba(47,111,237,0.10)" stroke="#2f6fed"/>
      <rect x="${200 - W / 2}" y="${170 + H / 2 - H * fill}" width="${W}" height="${H * fill}" fill="rgba(14,159,110,0.35)"/>
      <text x="200" y="300" text-anchor="middle" font-size="12" fill="#555" font-family="ui-sans-serif,system-ui">${bx} × ${by} mm footprint${fill > 0 ? ` · ${Math.round(fill * 100)}%` : ''}</text></svg>`;
  };
  ['mat', 'layer', 'infill'].forEach((id) => { const v = $(`${id}-v`); $(id).addEventListener('input', () => { if (v) v.textContent = $(id).value; est(); }); });

  $('stl').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([e.stl], { type: 'model/stl' }));
    a.download = e.name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
    $('msg').textContent = `Downloaded ${e.name}.`;
  });
  let sending = null;
  $('send').addEventListener('click', () => {
    if (sending) return;
    let p = 0; const layers = Math.max(20, Math.round((e.h || 18) / (+$('layer').value)));
    $('msg').textContent = 'Streaming to printer…';
    sending = setInterval(() => {
      p += 1 / layers; drawBed(p);
      if (p >= 1) { clearInterval(sending); sending = null; $('msg').textContent = 'Print complete (simulated). Connect OctoPrint/USB for a real printer.'; }
      else $('msg').textContent = `Printing… layer ${Math.round(p * layers)}/${layers}`;
    }, 120);
  });
  est();
  return { stop() { if (sending) clearInterval(sending); } };
}
