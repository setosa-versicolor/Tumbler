import type { RigidBody } from "@dimforge/rapier2d-deterministic-compat";
import type { Renderer } from "../render/renderer";
import type { Prop } from "../levels/kit";
import type { Game } from "../sim/game";
import type { Liquid } from "../levels/liquid";

// Props in HD, with proper materials: glass takeaway cups you can see the
// coffee in (the level drops as it spills; it sloshes when the cup's jolted),
// a brushed-steel tray with a highlight that slides as it moves, and glassy
// shards. Drawn only; the physics shapes are unchanged.

type Ctx = CanvasRenderingContext2D;
const INK = "#2a2230";

/** Colours a coffee cup's shards are made in (see SHARD_COLORS in kit). */
const CUP_SHARDS = new Set(["#f4f4f4", "#e9e2d6", "#6b4a3a"]);

interface Slosh {
  /** Tilt of the coffee's surface away from level (radians), and its rate. */
  tilt: number;
  v: number;
  /** Last velocity, to feel jolts. */
  vx: number;
}

export class PropArt {
  private slosh = new WeakMap<RigidBody, Slosh>();

  /** Draw `p` in HD if it's one of ours; false to leave it to the plain drawing. */
  draw(r: Renderer, p: Prop, game: Game, dt: number, glass: (fn: () => void) => void): boolean {
    if (p.kind === "cup") {
      this.cup(r, p, game, dt, glass);
      return true;
    }
    if (p.kind === "tray") {
      tray(r, p);
      return true;
    }
    if (p.kind === "shard" && CUP_SHARDS.has(p.color) && p.shape) {
      shard(r, p, glass);
      return true;
    }
    return false;
  }

  private cup(r: Renderer, p: Prop, game: Game, dt: number, glass: (fn: () => void) => void) {
    const coffee = (game.inst as { coffee?: Liquid }).coffee;
    const fill = coffee?.fillOf(p.body) ?? 1;
    const b = p.body;
    const angle = b.rotation();
    // The coffee sloshes: its surface lags behind the cup's sideways jolts.
    let s = this.slosh.get(b);
    const vx = b.linvel().x;
    if (!s) this.slosh.set(b, (s = { tilt: 0, v: 0, vx }));
    if (dt > 0) {
      const ax = Math.max(-40, Math.min(40, (vx - s.vx) / dt));
      s.v += (-ax * 0.05 - 90 * s.tilt - 3.5 * s.v) * dt;
      s.tilt = Math.max(-0.6, Math.min(0.6, s.tilt + s.v * dt));
      s.vx = vx;
    }
    const W = p.hw;
    const H = p.hh;
    // The glass: narrower at the base.
    const body = (ctx: Ctx, inset = 0) => {
      ctx.beginPath();
      ctx.moveTo(-W * 0.8 + inset, -H + inset);
      ctx.lineTo(W * 0.8 - inset, -H + inset);
      ctx.lineTo(W - inset, H * 0.72);
      ctx.lineTo(-W + inset, H * 0.72);
      ctx.closePath();
    };
    frame(r, b.translation(), angle, (ctx) => {
      // Coffee inside, its surface level in the world (plus the slosh).
      if (fill > 0.01) {
        ctx.save();
        body(ctx, 0.006);
        ctx.clip();
        const top = -H + 0.006 + fill * (H * 1.72 - 0.012);
        const t = Math.tan(Math.max(-1.2, Math.min(1.2, -angle + s.tilt)));
        const surface = (x: number) => top + t * x;
        ctx.beginPath();
        ctx.moveTo(-W * 1.2, surface(-W * 1.2));
        ctx.lineTo(W * 1.2, surface(W * 1.2));
        ctx.lineTo(W * 1.2, -H * 2);
        ctx.lineTo(-W * 1.2, -H * 2);
        ctx.closePath();
        const g = ctx.createLinearGradient(0, -H, 0, top);
        g.addColorStop(0, "#1f0e06");
        g.addColorStop(0.7, "#4a2410");
        g.addColorStop(1, "#7a4421");
        ctx.fillStyle = g;
        ctx.fill();
        // A layer of crema on top.
        ctx.strokeStyle = "#d9a873";
        ctx.lineWidth = 0.014;
        ctx.beginPath();
        ctx.moveTo(-W * 1.2, surface(-W * 1.2) - 0.005);
        ctx.lineTo(W * 1.2, surface(W * 1.2) - 0.005);
        ctx.stroke();
        ctx.restore();
      }
      // The glass itself: faintly frosted, an outline, a long highlight down one side and a short one on the other.
      body(ctx);
      ctx.fillStyle = "rgba(225,238,248,0.22)";
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.008;
      ctx.stroke();
      ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 0.007;
      ctx.beginPath();
      ctx.moveTo(-W * 0.62, -H * 0.8);
      ctx.lineTo(-W * 0.78, H * 0.55);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.lineWidth = 0.004;
      ctx.beginPath();
      ctx.moveTo(W * 0.7, H * 0.1);
      ctx.lineTo(W * 0.78, H * 0.5);
      ctx.stroke();
      // Silicone grip band, in the company orange, with ridges.
      ctx.beginPath();
      ctx.roundRect(-W * 0.93, -H * 0.18, W * 1.86, H * 0.3, 0.005);
      ctx.fillStyle = "#e9823a";
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.005;
      ctx.stroke();
      ctx.strokeStyle = "rgba(0,0,0,0.2)";
      ctx.lineWidth = 0.003;
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(i * W * 0.24, -H * 0.15);
        ctx.lineTo(i * W * 0.24, H * 0.09);
        ctx.stroke();
      }
      // Lid: dark plastic, a raised rim and the sip hole.
      ctx.beginPath();
      ctx.roundRect(-W * 1.1, H * 0.7, W * 2.2, H * 0.32, 0.008);
      ctx.fillStyle = "#3a2a24";
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.006;
      ctx.stroke();
      ctx.beginPath();
      ctx.roundRect(-W * 0.8, H * 0.98, W * 1.6, H * 0.18, 0.012);
      ctx.fillStyle = "#4a3830";
      ctx.fill();
      ctx.fillStyle = "#120a08";
      ctx.fillRect(W * 0.2, H * 1.06, W * 0.4, H * 0.06);
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.fillRect(-W * 0.7, H * 1.1, W * 0.6, H * 0.03);
    });
    // Where the glass is, the wall behind it bends a little.
    glass(() => frame(r, b.translation(), angle, (ctx) => {
      body(ctx);
      ctx.fillStyle = "#fff";
      ctx.fill();
    }));
  }
}

/** Draw in a body's frame, in metres, y up. */
function frame(r: Renderer, at: { x: number; y: number }, angle: number, fn: (ctx: Ctx) => void) {
  const ctx = r.ctx;
  const p = r.camera.toScreen(at);
  const s = r.camera.scale;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(-angle);
  ctx.scale(s, -s);
  ctx.lineJoin = "round";
  fn(ctx);
  ctx.restore();
}

/** The tray: brushed steel, with a reflection that slides along it as it moves and tilts. */
function tray(r: Renderer, p: Prop) {
  const b = p.body;
  const at = b.translation();
  const angle = b.rotation();
  const W = p.hw;
  const H = p.hh;
  frame(r, at, angle, (ctx) => {
    const shape = () => {
      ctx.beginPath();
      ctx.roundRect(-W, -H, W * 2, H * 2, H * 0.8);
      // The raised lips at each end.
      ctx.roundRect(-W, -H, 0.035, 0.145, 0.012);
      ctx.roundRect(W - 0.035, -H, 0.035, 0.145, 0.012);
    };
    shape();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.02;
    ctx.stroke();
    // Steel: cool greys, and a bright band where the room's lights catch it.
    const g = ctx.createLinearGradient(-W, 0, W, 0);
    const shine = Math.max(0.08, Math.min(0.92, 0.5 + Math.sin(angle * 4 + (at.x - r.camera.x) * 0.9) * 0.38));
    g.addColorStop(0, "#7d858f");
    g.addColorStop(Math.max(0, shine - 0.22), "#a9b1ba");
    g.addColorStop(Math.max(0, shine - 0.05), "#e9eef3");
    g.addColorStop(shine, "#ffffff");
    g.addColorStop(Math.min(1, shine + 0.06), "#d3d9df");
    g.addColorStop(Math.min(1, shine + 0.25), "#959da6");
    g.addColorStop(1, "#6f7780");
    ctx.fillStyle = g;
    shape();
    ctx.fill();
    // Brushed grain, a darker underside, a crisp top edge.
    ctx.save();
    shape();
    ctx.clip();
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 0.002;
    for (let i = 0; i < 6; i++) {
      const y = -H + (i + 0.5) * ((H * 2) / 6);
      ctx.beginPath();
      ctx.moveTo(-W, y);
      ctx.lineTo(W, y + 0.001);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(20,24,30,0.3)";
    ctx.fillRect(-W, -H, W * 2, H * 0.6);
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 0.004;
    ctx.beginPath();
    ctx.moveTo(-W + 0.04, H - 0.002);
    ctx.lineTo(W - 0.04, H - 0.002);
    ctx.stroke();
  });
}

/** A shard of a glass cup: clear, with bright edges (and the odd bit of orange band). */
function shard(r: Renderer, p: Prop, glass: (fn: () => void) => void) {
  const pts = p.shape!;
  const path = (ctx: Ctx) => {
    ctx.beginPath();
    for (const q of pts) ctx.lineTo(q.x, q.y);
    ctx.closePath();
  };
  frame(r, p.body.translation(), p.body.rotation(), (ctx) => {
    path(ctx);
    ctx.fillStyle = p.color === "#6b4a3a" ? "rgba(233,130,58,0.85)" : "rgba(220,236,248,0.32)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 0.004;
    ctx.stroke();
    ctx.strokeStyle = "rgba(42,34,48,0.55)";
    ctx.lineWidth = 0.002;
    ctx.stroke();
  });
  glass(() => frame(r, p.body.translation(), p.body.rotation(), (ctx) => {
    path(ctx);
    ctx.fillStyle = "#fff";
    ctx.fill();
  }));
}
