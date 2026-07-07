// Virtual-environment fly — a 2D top-down body that flies, driven by the brain's real
// motor-command pathway. Thrust comes from the descending + motor neurons' activity; yaw
// (banking) from the left/right asymmetry of the descending population. Zero motor activity
// → it just hovers (no scripted motion). Nothing here is choreographed: the flight path is
// the connectome's output, exactly as the worm's crawl is.

export class FlyViz {
  constructor(canvas) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
    this.x = this.w * 0.5; this.y = this.h * 0.5;
    this.heading = -0.5;      // radians; +x is "forward" in body frame
    this.speed = 0;           // px/frame (wing-inertia smoothed)
    this.bank = 0;            // smoothed yaw
    this.wing = 0;            // wingbeat phase
    this.trail = [];
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const r = this.c.getBoundingClientRect();
    this.w = r.width; this.h = r.height;
    this.c.width = this.w * dpr; this.c.height = this.h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // thrust: forward drive (0 = hover) · yaw: bank/turn · activity: glow · wingbeat: flap rate
  frame({ thrust = 0, yaw = 0, activity = 0, wingbeat = 0 } = {}) {
    // motion integrates the decode — flight inertia smooths the pulsing neural drive
    const target = Math.max(0, thrust);
    this.speed += (target - this.speed) * 0.12;
    this.bank += (yaw - this.bank) * 0.1;
    this.heading += this.bank;

    let nx = this.x + Math.cos(this.heading) * this.speed;
    let ny = this.y + Math.sin(this.heading) * this.speed;
    const m = 26;
    if (nx < m || nx > this.w - m) { this.heading = Math.PI - this.heading; this.bank *= -0.5; nx = Math.min(this.w - m, Math.max(m, nx)); }
    if (ny < m || ny > this.h - m) { this.heading = -this.heading; this.bank *= -0.5; ny = Math.min(this.h - m, Math.max(m, ny)); }
    this.x = nx; this.y = ny;

    // wings buzz with activity even when hovering; faster with thrust
    this.wing += 0.9 + (wingbeat + this.speed) * 1.8;

    this.trail.unshift({ x: this.x, y: this.y });
    while (this.trail.length > 18) this.trail.pop();

    this.draw(activity);
  }

  draw(activity) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);

    // faint motion trail
    if (this.trail.length > 2) {
      ctx.beginPath();
      ctx.moveTo(this.trail[0].x, this.trail[0].y);
      for (let i = 1; i < this.trail.length; i++) ctx.lineTo(this.trail[i].x, this.trail[i].y);
      ctx.strokeStyle = 'rgba(14,159,110,0.14)';
      ctx.lineWidth = 2; ctx.stroke();
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.heading);
    ctx.scale(1.5, 1.5);                                // a touch larger so detail reads

    const warm = Math.min(1, activity * 2.4);
    const flap = Math.sin(this.wing);                  // -1..1 wing sweep
    const buzz = 0.35 + 0.35 * Math.abs(flap);         // beat opacity

    // ---- soft ground shadow ------------------------------------------------------------
    ctx.save();
    ctx.globalAlpha = 0.12; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(-2, 4, 15, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    this._legs(ctx);
    this._wings(ctx, flap, buzz);                      // under the body
    this._body(ctx, warm);
    this._head(ctx, warm);

    ctx.restore();
  }

  // six jointed legs (femur + tibia), splayed like a real fly, with a subtle walking kick
  _legs(ctx) {
    ctx.strokeStyle = 'rgba(26,20,16,0.9)'; ctx.lineCap = 'round';
    const conf = [                                     // [hipX, femurAngle, tibiaAngle, len]
      [3.5, -0.5, -1.3, 8],    // front  (point forward-out)
      [0.5, 0.5, 1.4, 9],      // middle (out to the side)
      [-2.5, 1.4, 2.1, 9.5],   // hind   (sweep back)
    ];
    for (const s of [-1, 1]) {
      for (let k = 0; k < conf.length; k++) {
        const [hx, fa, ta, L] = conf[k];
        const kick = Math.sin(this.wing * 0.5 + k * 1.6) * 0.12;
        const a1 = s * (fa + kick), a2 = s * (ta + kick);
        const kx = hx + Math.cos(a1) * L * 0.55, ky = s * 3 + Math.sin(a1) * L * 0.55;
        const tx = kx + Math.cos(a2) * L * 0.6, ty = ky + Math.sin(a2) * L * 0.6;
        ctx.lineWidth = 1.5; ctx.beginPath();
        ctx.moveTo(hx, s * 3); ctx.lineTo(kx, ky);     // femur
        ctx.lineWidth = 1.1; ctx.lineTo(tx, ty);       // tibia
        ctx.stroke();
      }
    }
  }

  // two veined, translucent wings with motion blur (ghosted beat positions)
  _wings(ctx, flap, buzz) {
    const spread = 0.62 + 0.42 * flap;                 // hinge sweep
    for (const s of [-1, 1]) {
      // motion-blur ghosts: a couple of fainter wings at nearby beat angles
      for (const g of [-0.28, -0.14, 0]) {
        ctx.save();
        ctx.translate(-1.5, s * 1.5);
        ctx.rotate(s * (spread + g));
        ctx.beginPath();
        // elongated Drosophila wing, wider at the tip
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(-16, s * -7, -30, s * -3);
        ctx.quadraticCurveTo(-34, 0, -30, s * 3);
        ctx.quadraticCurveTo(-16, s * 5, 0, 0);
        const tip = g === 0 ? 0.30 + 0.22 * buzz : 0.08;
        ctx.fillStyle = `rgba(214,224,240,${tip})`;
        ctx.fill();
        if (g === 0) {
          ctx.strokeStyle = 'rgba(150,166,196,0.5)'; ctx.lineWidth = 0.5; ctx.stroke();
          // a few longitudinal veins
          ctx.strokeStyle = 'rgba(120,136,168,0.45)'; ctx.lineWidth = 0.5;
          for (const vy of [-3, 0, 3]) {
            ctx.beginPath(); ctx.moveTo(-3, s * vy * 0.3);
            ctx.quadraticCurveTo(-18, s * vy, -29, s * vy * 0.6); ctx.stroke();
          }
        }
        ctx.restore();
      }
      // haltere — the little knobbed balancer behind each wing
      ctx.save();
      ctx.fillStyle = 'rgba(120,90,60,0.9)'; ctx.strokeStyle = 'rgba(90,66,44,0.9)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-4, s * 3); ctx.lineTo(-7, s * 6); ctx.stroke();
      ctx.beginPath(); ctx.arc(-7.5, s * 6.6, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  // segmented tan abdomen with black bands + bristly thorax (Drosophila colouring)
  _body(ctx, warm) {
    // abdomen
    const ab = ctx.createLinearGradient(-20, -6, -4, 6);
    ab.addColorStop(0, '#7a5a2e');
    ab.addColorStop(1, `rgb(${196 + warm * 40 | 0},${150 - warm * 20 | 0},80)`);
    ctx.fillStyle = ab;
    ctx.beginPath(); ctx.ellipse(-11, 0, 11, 6.2, 0, 0, Math.PI * 2); ctx.fill();
    // dark posterior bands
    ctx.fillStyle = 'rgba(26,18,10,0.72)';
    for (let i = 0; i < 4; i++) {
      const bx = -6 - i * 3.4, hw = 6.2 * Math.sqrt(Math.max(0, 1 - ((bx + 11) / 11) ** 2));
      ctx.beginPath(); ctx.ellipse(bx, 0, 1.5, hw, 0, 0, Math.PI * 2); ctx.fill();
    }
    // thorax — amber-brown, glossy, faint dorsal stripes + bristle dots
    const th = ctx.createRadialGradient(-1, -2, 1, -1, 0, 9);
    th.addColorStop(0, '#c79a55'); th.addColorStop(1, '#8a6329');
    ctx.fillStyle = th; ctx.shadowColor = `rgba(14,159,110,${0.25 + warm * 0.4})`;
    ctx.shadowBlur = 6 + warm * 14;
    ctx.beginPath(); ctx.ellipse(-1, 0, 8, 6.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(60,40,20,0.4)'; ctx.lineWidth = 0.6;
    for (const sy of [-2.2, 0, 2.2]) { ctx.beginPath(); ctx.moveTo(-6, sy); ctx.lineTo(4, sy * 0.6); ctx.stroke(); }
  }

  // big-eyed head — the hallmark of Drosophila: huge red compound eyes
  _head(ctx, warm) {
    // eyes (drawn large, behind the small face)
    for (const s of [-1, 1]) {
      const eg = ctx.createRadialGradient(8, s * 3.4, 0.5, 9, s * 3.4, 4.5);
      eg.addColorStop(0, `rgb(${220 + warm * 30 | 0},70,60)`);
      eg.addColorStop(1, '#8a1410');
      ctx.fillStyle = eg;
      ctx.beginPath(); ctx.ellipse(9, s * 3.2, 4.2, 3.8, s * 0.3, 0, Math.PI * 2); ctx.fill();
      // ommatidia speckle + glint
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.arc(10.5, s * 2.2, 0.9, 0, Math.PI * 2); ctx.fill();
    }
    // face/frons between the eyes
    ctx.fillStyle = '#b98f4c';
    ctx.beginPath(); ctx.ellipse(9, 0, 3, 3.4, 0, 0, Math.PI * 2); ctx.fill();
    // antennae with arista
    ctx.strokeStyle = 'rgba(40,28,16,0.9)'; ctx.lineWidth = 1; ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(11, s * 1.2); ctx.lineTo(13.5, s * 2.2);
      ctx.lineTo(16.5, s * 1.4); ctx.stroke();          // arista bends forward
    }
    // proboscis
    ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(14.5, 0); ctx.stroke();
  }
}
