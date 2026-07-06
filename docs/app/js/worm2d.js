// Virtual-environment worm — a 2D body that crawls, driven by the brain's locomotion
// command. Body follows the head's trail (natural path) with a travelling sinusoidal
// undulation. Forward command → crawl forward; reverse command → back up.

export class WormViz {
  constructor(canvas, opts = {}) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.bodyLen = opts.bodyLen || 90;    // trail points making up the body
    this.width = opts.width || 15;         // max half-thickness (px)
    this.base = opts.base || 1.5;          // base crawl speed (px/frame)
    this.theta = -0.3;
    this.phase = 0;
    this.dir = 1;                          // +1 forward, -1 reverse
    this.trail = [];
    this.resize();
    const cx = this.w * 0.5, cy = this.h * 0.5;
    for (let i = 0; i < this.bodyLen; i++) this.trail.push({ x: cx - i * 3, y: cy });
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const r = this.c.getBoundingClientRect();
    this.w = r.width; this.h = r.height;
    this.c.width = this.w * dpr; this.c.height = this.h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // drive: crawl speed from neural activity (0 = still) · dir: +1/-1 · activity: glow · turn
  frame({ drive = 1, dir = 1, activity = 0.3, turn = 0 } = {}) {
    const v = this.base * Math.max(0, drive);   // 0 activity → 0 crawl (no gimmick motion)
    this.dir = dir;
    this.theta += (Math.sin(this.phase * 0.13) * 0.02) + turn * 0.05;
    const head = this.trail[0];
    let nx = head.x + Math.cos(this.theta) * v * dir;
    let ny = head.y + Math.sin(this.theta) * v * dir;
    const m = 24;
    if (nx < m || nx > this.w - m) { this.theta = Math.PI - this.theta; nx = Math.min(this.w - m, Math.max(m, nx)); }
    if (ny < m || ny > this.h - m) { this.theta = -this.theta; ny = Math.min(this.h - m, Math.max(m, ny)); }
    // Rope-follow: keep a fixed segment length between body points. Commit a new point
    // when the head is a segment away from the neck; otherwise just slide the head.
    // This keeps the body its full length at rest (no collapse) with no drifting tail.
    const neck = this.trail[1] || head;
    if (Math.hypot(nx - neck.x, ny - neck.y) >= 3.2) {
      this.trail.unshift({ x: nx, y: ny });
      while (this.trail.length > this.bodyLen) this.trail.pop();
    } else {
      this.trail[0] = { x: nx, y: ny };
    }
    this.phase += 0.35 * v;   // undulation advances only with neural drive
    this.draw(activity);
  }

  draw(activity) {
    const ctx = this.ctx, T = this.trail, n = T.length;
    ctx.clearRect(0, 0, this.w, this.h);

    // undulated centerline: offset each body point perpendicular to its tangent
    const amp = 9;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const p = T[i];
      const a = T[Math.min(i + 1, n - 1)], b = T[Math.max(i - 1, 0)];
      const tx = a.x - b.x, ty = a.y - b.y;
      const L = Math.hypot(tx, ty) || 1;
      const px = -ty / L, py = tx / L; // perpendicular
      const env = Math.sin((i / n) * Math.PI);         // taper wave at ends
      const off = Math.sin(this.phase - i * 0.5) * amp * env;
      pts.push({ x: p.x + px * off, y: p.y + py * off, i });
    }

    // body as a tapered tube (two edges)
    const half = (i) => this.width * Math.sin((i / n) * Math.PI) * 0.9 + 1.5;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const p = pts[i], a = pts[Math.min(i + 1, n - 1)], b = pts[Math.max(i - 1, 0)];
      const tx = a.x - b.x, ty = a.y - b.y; const L = Math.hypot(tx, ty) || 1;
      const px = -ty / L, py = tx / L; const hw = half(i);
      ctx[i === 0 ? 'moveTo' : 'lineTo'](p.x + px * hw, p.y + py * hw);
    }
    for (let i = n - 1; i >= 0; i--) {
      const p = pts[i], a = pts[Math.min(i + 1, n - 1)], b = pts[Math.max(i - 1, 0)];
      const tx = a.x - b.x, ty = a.y - b.y; const L = Math.hypot(tx, ty) || 1;
      const px = -ty / L, py = tx / L; const hw = half(i);
      ctx.lineTo(p.x - px * hw, p.y - py * hw);
    }
    ctx.closePath();

    // color: teal→green body, warmer when neural activity is high
    const warm = Math.min(1, activity * 2.2);
    const g = ctx.createLinearGradient(pts[n - 1].x, pts[n - 1].y, pts[0].x, pts[0].y);
    g.addColorStop(0, `rgba(47,111,237,0.85)`);
    g.addColorStop(0.6, `rgba(14,159,110,0.9)`);
    g.addColorStop(1, `rgba(${Math.round(14 + warm * 200)},${Math.round(159 - warm * 30)},${Math.round(110 - warm * 90)},0.95)`);
    ctx.fillStyle = g;
    ctx.shadowColor = 'rgba(14,159,110,0.35)'; ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;

    // head marker
    const h0 = pts[0];
    ctx.beginPath();
    ctx.arc(h0.x, h0.y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#0d0d0f';
    ctx.fill();
  }
}
