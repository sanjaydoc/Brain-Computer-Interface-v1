// Virtual-environment activity view — for brains with no body (a cortical slice like the
// MICrONS mouse V1, or a statistical mesoscale sheet). A cortex doesn't crawl or fly; its
// "behaviour" is its own dynamics. So instead of an avatar we show the real thing: a spike
// raster (sampled neurons × time, scrolling) and a live population-firing-rate trace. All of
// it emerges from simulating the connectome — nothing is scripted.

export class ActivityViz {
  constructor(canvas, n) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
    this.ROWS = Math.min(150, n);
    // sample neurons evenly across the population for the raster rows
    this.sample = Array.from({ length: this.ROWS }, (_, r) => Math.floor(r * n / this.ROWS));
    this.cols = [];   // ring buffer: each entry a Uint8Array(ROWS) of this-step spikes
    this.rate = [];   // population-rate history (0..1)
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const r = this.c.getBoundingClientRect();
    this.w = r.width; this.h = r.height;
    this.c.width = this.w * dpr; this.c.height = this.h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.maxCols = Math.max(40, Math.floor(this.w / 2.2));
  }

  // fired: Uint8Array length n (this step's spikes) · rate: smoothed population activity 0..1
  frame(fired, rate) {
    const col = new Uint8Array(this.ROWS);
    for (let r = 0; r < this.ROWS; r++) col[r] = fired[this.sample[r]] ? 1 : 0;
    this.cols.push(col); if (this.cols.length > this.maxCols) this.cols.shift();
    this.rate.push(rate); if (this.rate.length > this.maxCols) this.rate.shift();
    this.draw();
  }

  draw() {
    const ctx = this.ctx, W = this.w, H = this.h;
    ctx.clearRect(0, 0, W, H);

    const pad = 8;
    const rasterTop = 22, rasterH = H * 0.66 - rasterTop;
    const rateTop = H * 0.66 + 18, rateH = H - rateTop - pad;
    const cw = (W - 2 * pad) / this.maxCols;
    const rh = rasterH / this.ROWS;

    // --- spike raster (neurons × time) --------------------------------------------------
    ctx.fillStyle = 'rgba(120,120,132,0.9)'; ctx.font = '600 10px system-ui, sans-serif';
    ctx.fillText(`SPIKE RASTER · ${this.ROWS} neurons × time →`, pad, 13);
    // faint frame
    ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 1;
    ctx.strokeRect(pad, rasterTop, W - 2 * pad, rasterH);
    for (let x = 0; x < this.cols.length; x++) {
      const col = this.cols[x];
      for (let r = 0; r < this.ROWS; r++) {
        if (col[r]) {
          ctx.fillStyle = 'rgba(230,150,30,0.92)';
          ctx.fillRect(pad + x * cw, rasterTop + r * rh, Math.max(1, cw), Math.max(1, rh));
        }
      }
    }

    // --- population-rate trace ----------------------------------------------------------
    ctx.fillStyle = 'rgba(120,120,132,0.9)';
    ctx.fillText('POPULATION FIRING RATE', pad, rateTop - 5);
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.strokeRect(pad, rateTop, W - 2 * pad, rateH);
    if (this.rate.length > 1) {
      ctx.beginPath();
      const base = rateTop + rateH;
      for (let x = 0; x < this.rate.length; x++) {
        const y = base - Math.min(1, this.rate[x] * 4) * rateH;
        ctx[x === 0 ? 'moveTo' : 'lineTo'](pad + x * cw, y);
      }
      ctx.strokeStyle = 'rgba(14,159,110,0.95)'; ctx.lineWidth = 1.6; ctx.stroke();
      // fill under the curve
      ctx.lineTo(pad + (this.rate.length - 1) * cw, base);
      ctx.lineTo(pad, base); ctx.closePath();
      ctx.fillStyle = 'rgba(14,159,110,0.10)'; ctx.fill();
    }
  }
}
