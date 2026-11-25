import type { Particle } from "../render/renderer";
import type { Camera } from "../render/renderer";

// Particles in HD: soft dust puffs, chips of debris that bounce, confetti that
// flips and catches the light, glass glints that twinkle, dizzy stars that glow.

type Ctx = CanvasRenderingContext2D;

/** Draw `p` the HD way (it's `t` of the way through its life); false to leave it to the plain drawing. */
export function drawParticleHD(ctx: Ctx, cam: Camera, p: Particle, t: number, dt: number): boolean {
  const sc = cam.scale;
  const s = cam.toScreen(p.pos);
  switch (p.shape) {
    case "dust": {
      // A soft puff that spreads and fades, cooler as it thins.
      p.vel.y *= 1 - dt * 3;
      p.vel.x *= 1 - dt * 2;
      const r = p.size * sc * (0.8 + t * 1.6);
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
      g.addColorStop(0, `rgba(170,160,175,${0.4 * (1 - t)})`);
      g.addColorStop(0.6, `rgba(150,145,165,${0.18 * (1 - t)})`);
      g.addColorStop(1, "rgba(140,140,160,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fill();
      return true;
    }
    case "chip": {
      // A bit of debris: falls, bounces off the floor, tumbles.
      fall(p, dt, 0.35);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(p.age * p.spin);
      ctx.globalAlpha = Math.min(1, (1 - t) * 4);
      const r = p.size * sc;
      ctx.beginPath();
      ctx.moveTo(-r, -r * 0.6);
      ctx.lineTo(r, -r * 0.3);
      ctx.lineTo(r * 0.2, r * 0.8);
      ctx.closePath();
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      return true;
    }
    case "sparkle": {
      // A glint off a splinter of glass: a four-pointed star that twinkles.
      fall(p, dt, 0.3);
      const tw = 0.45 + 0.55 * Math.abs(Math.sin(p.age * 26 + p.spin));
      const r = p.size * sc * tw * (1 - t * 0.6);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = Math.min(1, (1 - t) * 2.5);
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * 1.4);
      g.addColorStop(0, "rgba(220,240,255,0.9)");
      g.addColorStop(1, "rgba(160,200,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r * 1.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + p.spin;
        const rr = i % 2 ? r * 0.14 : r * 1.6;
        ctx.lineTo(s.x + Math.cos(a) * rr, s.y + Math.sin(a) * rr);
      }
      ctx.fill();
      ctx.restore();
      return true;
    }
    case "confetti": {
      // Paper turning over as it falls: narrows edge-on, flashes when it faces the light.
      p.vel.y -= 6 * dt;
      p.vel.x *= 1 - dt * 1.5;
      const flip = Math.cos(p.age * p.spin * 0.8);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(p.age * p.spin * 0.35);
      ctx.globalAlpha = Math.min(1, (1 - t) * 3);
      const w = p.size * sc;
      ctx.fillStyle = p.color;
      ctx.fillRect(-w, -w * 0.4 * Math.abs(flip) - 0.5, w * 2, w * 0.8 * Math.abs(flip) + 1);
      if (flip > 0.85) {
        ctx.fillStyle = `rgba(255,255,255,${(flip - 0.85) * 4})`;
        ctx.fillRect(-w, -w * 0.4 * flip, w * 2, w * 0.8 * flip);
      } else if (flip < 0) {
        ctx.fillStyle = `rgba(0,0,0,${-flip * 0.25})`;
        ctx.fillRect(-w, -w * 0.4 * -flip, w * 2, w * 0.8 * -flip);
      }
      ctx.restore();
      return true;
    }
    case "star": {
      // Dizzy stars: a glow behind each one (the plain drawing moves them on).
      const r = p.size * sc * (1 - t);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * 2.6);
      g.addColorStop(0, "rgba(255,220,90,0.55)");
      g.addColorStop(1, "rgba(255,200,60,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r * 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return false; // and the star itself, as usual
    }
    default:
      return false;
  }
}

/** Gravity, and a bounce off the floor (y = 0) losing most of the speed. */
function fall(p: Particle, dt: number, bounce: number) {
  p.vel.y -= 9.8 * dt;
  if (p.pos.y < 0.01 && p.vel.y < 0) {
    p.pos.y = 0.01;
    p.vel.y = -p.vel.y * bounce;
    p.vel.x *= 0.55;
    p.spin *= 0.6;
  }
}
