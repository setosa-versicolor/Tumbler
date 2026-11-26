import type { RigidBody } from "@dimforge/rapier2d-deterministic-compat";
import type { Game, GameEvent } from "../sim/game";
import type { Prop, Solid } from "./kit";
import type { Tuning } from "../sim/tuning";
import { DIM } from "../physics/body/rig";
import { clamp, type Vec } from "../sim/math";
import { DT } from "../physics/world";

// Spilled liquid: a little particle fluid (position-based, with double-density
// relaxation so it clumps, splashes and spreads like a liquid), poured from
// cups that tip, slopped out of cups that get jolted, and dumped all at once
// from a cup that breaks. Drops that come to rest on something solid settle
// into a puddle there, and a puddle is slippery underfoot.

/** Interaction radius between drops. */
const H = 0.055;
/** Drop radius (for collisions). */
const R = 0.012;
const REST = 3.2;
const STIFF = 2600;
const STIFF_NEAR = 9000;
/** Velocity smoothing between neighbours (viscosity). */
const VISC = 0.06;
/** Most drops in flight at once. */
const MAX_DROPS = 560;
/** How much coffee is in a full cup, in drops. */
export const CUP_FILL = 48;
/** Puddle length per drop that lands in it (a thin film, a few mm deep). */
const SPREAD = 0.0065;
/** Most a puddle can grow by per second as it spreads out. */
const SPREAD_RATE = 0.6;
/** Traction (fraction of normal) with a foot in a puddle. */
export const SLICK = 0.12;

export interface Drop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  px: number;
  py: number;
  /** Seconds it's been sitting still on something static. */
  rest: number;
  /** The static surface it's resting on (its top y, and its extent), if any. */
  on: { y: number; x0: number; x1: number } | null;
}

export interface Puddle {
  /** Centre and surface height. */
  x: number;
  y: number;
  /** Half-length now, and what it's spreading out to. */
  w: number;
  target: number;
  /** The surface's ends: a puddle can't spread off the edge. */
  x0: number;
  x1: number;
}

interface CupState {
  fill: number;
  pos: Vec;
  vel: Vec;
  angle: number;
  /** Fractional drops owed (pouring is a rate). */
  owe: number;
}

/** A capsule (a Stanley limb) or ball, for drops to splash off. */
interface Capsule {
  body: RigidBody;
  hl: number;
  r: number;
}

export class Liquid {
  readonly drops: Drop[] = [];
  readonly puddles: Puddle[] = [];
  private cups = new Map<RigidBody, CupState>();
  private grid = new Map<number, number[]>();
  private base: Tuning | null = null;
  private slickTuning: Tuning | null = null;
  private slipCooldown = 0;
  private wasIn = false;
  /** Is a foot in a puddle right now? */
  slick = false;

  /** A push on every drop, besides gravity (turbulence, say), m/s². */
  extra = { x: 0, y: 0 };

  constructor(
    private kind = "cup",
    private opts: {
      /** Something that soaks up a drop (a glass being filled): true, and the drop's gone. */
      absorb?: (d: Drop) => boolean;
      /** Props the liquid passes straight through (the bottle it's pouring from). */
      ignore?: (p: Prop) => boolean;
    } = {},
  ) {}

  /** Coffee left in a cup (0–1), or null if it isn't one we know. */
  fillOf(body: RigidBody): number | null {
    const c = this.cups.get(body);
    return c ? c.fill / CUP_FILL : null;
  }

  update(game: Game, dt: number): GameEvent[] {
    const events: GameEvent[] = [];
    this.trackCups(game, dt);
    this.simulate(game, dt);
    this.settle(dt);
    this.spread(dt);
    events.push(...this.underfoot(game, dt));
    return events;
  }

  // ---------------------------------------------------------- sources ---

  private trackCups(game: Game, dt: number) {
    const seen = new Set<RigidBody>();
    for (const p of game.props) {
      if (p.kind !== this.kind) continue;
      seen.add(p.body);
      const pos = p.body.translation();
      const vel = p.body.linvel();
      const angle = p.body.rotation();
      let c = this.cups.get(p.body);
      if (!c) {
        this.cups.set(p.body, { fill: CUP_FILL, pos: { ...pos }, vel: { ...vel }, angle, owe: 0 });
        continue;
      }
      // Tipped past the lip: it pours out of the sip hole, faster the further it tips.
      const tilt = Math.abs(angle);
      if (tilt > 0.38 && c.fill > 0) c.owe += clamp((tilt - 0.38) / 0.45, 0, 1) * 55 * dt;
      // A sharp jolt sloshes some out over the lid.
      const dvx = vel.x - c.vel.x;
      const dvy = vel.y - c.vel.y;
      const jolt = Math.hypot(dvx, dvy);
      if (jolt > 0.8 && c.fill > 0) c.owe += Math.min(4, (jolt - 0.8) * 3);
      const n = Math.min(Math.floor(c.owe), Math.floor(c.fill));
      if (n > 0) {
        c.owe -= n;
        c.fill -= n;
        // The sip hole is on the lid, at the side that's lower.
        const side = angle > 0 ? -1 : 1;
        const cs = Math.cos(angle);
        const sn = Math.sin(angle);
        const lx = side * p.hw * 0.7;
        const ly = p.hh;
        const hole = { x: pos.x + lx * cs - ly * sn, y: pos.y + lx * sn + ly * cs };
        // Out it comes: carried along with the cup, thrown back against a jolt, and a bit out of the hole.
        const out = { x: -sn, y: cs };
        for (let i = 0; i < n; i++) {
          const j = (game.rand() - 0.5) * 0.4;
          this.add(
            hole.x + (game.rand() - 0.5) * 0.02,
            hole.y + (game.rand() - 0.5) * 0.02,
            vel.x - dvx * 0.5 + out.x * 0.5 + j,
            vel.y - dvy * 0.5 + out.y * 0.5 + game.rand() * 0.3,
          );
        }
      }
      c.pos = { ...pos };
      c.vel = { ...vel };
      c.angle = angle;
    }
    // Broken (gone from the world): whatever was left in it goes everywhere.
    for (const [body, c] of this.cups) {
      if (seen.has(body)) continue;
      this.cups.delete(body);
      const n = Math.floor(c.fill);
      for (let i = 0; i < n; i++) {
        const a = game.rand() * Math.PI;
        const s = 0.4 + game.rand() * 1.6;
        this.add(
          c.pos.x + (game.rand() - 0.5) * 0.1,
          c.pos.y + (game.rand() - 0.5) * 0.1,
          c.vel.x * 0.8 + Math.cos(a) * s,
          c.vel.y * 0.5 + Math.sin(a) * s * 0.9,
        );
      }
    }
  }

  /** Add a drop of liquid at a point, moving. */
  add(x: number, y: number, vx: number, vy: number) {
    if (this.drops.length >= MAX_DROPS) return;
    this.drops.push({ x, y, vx, vy, px: x, py: y, rest: 0, on: null });
  }

  // ------------------------------------------------------------ fluid ---

  private simulate(game: Game, dt: number) {
    const drops = this.drops;
    if (!drops.length) return;
    const g = game.tuning.gravity;
    // Viscosity, then gravity and a step forward.
    this.buildGrid();
    for (const [i, a] of drops.entries()) {
      this.neighbours(a, i, (b, q, dx, dy, r) => {
        const u = ((a.vx - b.vx) * dx + (a.vy - b.vy) * dy) / r;
        if (u <= 0) return;
        const k = VISC * (1 - q) * u * 0.5;
        a.vx -= (dx / r) * k;
        a.vy -= (dy / r) * k;
        b.vx += (dx / r) * k;
        b.vy += (dy / r) * k;
      });
    }
    for (const d of drops) {
      d.vx += this.extra.x * dt;
      d.vy += (this.extra.y - g) * dt;
      d.px = d.x;
      d.py = d.y;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
    }
    // Double-density relaxation: drops push apart when crowded, pull together near the edge (surface tension).
    this.buildGrid();
    const dt2 = dt * dt;
    for (const [i, a] of drops.entries()) {
      let rho = 0;
      let near = 0;
      const ns: [Drop, number, number, number, number][] = [];
      this.neighbours(a, i, (b, q, dx, dy, r) => {
        const w = 1 - q;
        rho += w * w;
        near += w * w * w;
        ns.push([b, q, dx, dy, r]);
      });
      const P = STIFF * (rho - REST);
      const Pn = STIFF_NEAR * near;
      let ax = 0;
      let ay = 0;
      for (const [b, q, dx, dy, r] of ns) {
        const w = 1 - q;
        const D = dt2 * (P * w + Pn * w * w) * 0.5 * 0.001;
        const mx = (dx / r) * D;
        const my = (dy / r) * D;
        b.x += mx;
        b.y += my;
        ax -= mx;
        ay -= my;
      }
      a.x += ax;
      a.y += ay;
    }
    // Hit things, then velocities from how far each drop actually went.
    const statics = game.solids;
    const movers = game.props.filter((p) => p.kind !== "shard" && p.kind !== this.kind && !this.opts.ignore?.(p));
    const caps = capsules(game);
    const absorb = this.opts.absorb;
    if (absorb) for (let i = drops.length - 1; i >= 0; i--) if (absorb(drops[i])) drops.splice(i, 1);
    for (const d of drops) {
      d.on = null;
      for (const s of statics) this.hitSolid(d, s);
      for (const p of movers) this.hitProp(d, p);
      for (const c of caps) hitCapsule(d, c);
      d.vx = (d.x - d.px) / dt;
      d.vy = (d.y - d.py) / dt;
      if (d.on) d.vx *= 0.9;
    }
  }

  private buildGrid() {
    this.grid.clear();
    for (const [i, d] of this.drops.entries()) {
      const k = cell(d.x, d.y);
      const list = this.grid.get(k);
      if (list) list.push(i);
      else this.grid.set(k, [i]);
    }
  }

  /** Each neighbour within H of drop i, once per pair (only j > i). */
  private neighbours(a: Drop, i: number, fn: (b: Drop, q: number, dx: number, dy: number, r: number) => void) {
    const cx = Math.floor(a.x / H);
    const cy = Math.floor(a.y / H);
    for (let ox = -1; ox <= 1; ox++)
      for (let oy = -1; oy <= 1; oy++) {
        const list = this.grid.get(key(cx + ox, cy + oy));
        if (!list) continue;
        for (const j of list) {
          if (j <= i) continue;
          const b = this.drops[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const r = Math.hypot(dx, dy);
          if (r >= H || r < 1e-6) continue;
          fn(b, r / H, dx, dy, r);
        }
      }
  }

  private hitSolid(d: Drop, s: Solid) {
    if (s.hidden && s.kind !== "floor" && s.kind !== "wall") return;
    const c = Math.cos(s.angle);
    const sn = Math.sin(s.angle);
    const rx = d.x - s.x;
    const ry = d.y - s.y;
    const lx = rx * c + ry * sn;
    const ly = -rx * sn + ry * c;
    const ex = s.hw + R - Math.abs(lx);
    const ey = s.hh + R - Math.abs(ly);
    if (ex <= 0 || ey <= 0) return;
    let nx = 0;
    let ny = 0;
    if (ex < ey) nx = Math.sign(lx) * ex;
    else ny = Math.sign(ly) * ey;
    d.x += nx * c - ny * sn;
    d.y += nx * sn + ny * c;
    // Resting on a flat top.
    if (ny > 0 && !s.angle) d.on = { y: s.y + s.hh, x0: s.x - s.hw, x1: s.x + s.hw };
  }

  private hitProp(d: Drop, p: Prop) {
    const b = p.body;
    const t = b.translation();
    const a = b.rotation();
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const rx = d.x - t.x;
    const ry = d.y - t.y;
    const lx = rx * c + ry * sn;
    const ly = -rx * sn + ry * c;
    const ex = p.hw + R - Math.abs(lx);
    const ey = p.hh + R - Math.abs(ly);
    if (ex <= 0 || ey <= 0) return;
    let nx = 0;
    let ny = 0;
    if (ex < ey) nx = Math.sign(lx) * ex;
    else ny = Math.sign(ly) * ey;
    d.x += nx * c - ny * sn;
    d.y += nx * sn + ny * c;
    // Dragged along with it (a tray full of slops): half-way to its velocity there.
    const v = b.linvel();
    const w = b.angvel();
    d.px = d.px * 0.5 + (d.x - (v.x - w * ry) * DT) * 0.5;
    d.py = d.py * 0.5 + (d.y - (v.y + w * rx) * DT) * 0.5;
  }

  // --------------------------------------------------------- puddles ---

  /** Drops sitting still on something static join (or start) a puddle there. */
  private settle(dt: number) {
    const keep: Drop[] = [];
    for (const d of this.drops) {
      const still = d.on && Math.hypot(d.vx, d.vy) < 0.35;
      d.rest = still ? d.rest + dt : 0;
      if (!d.on || d.rest < 0.25) {
        // Fell out of the room: gone.
        if (d.y > -5) keep.push(d);
        continue;
      }
      const s = d.on;
      let p = this.puddles.find((q) => Math.abs(q.y - s.y) < 0.02 && d.x > q.x - q.w - 0.06 && d.x < q.x + q.w + 0.06);
      if (!p) {
        p = { x: clamp(d.x, s.x0, s.x1), y: s.y, w: 0.01, target: 0, x0: s.x0, x1: s.x1 };
        this.puddles.push(p);
      }
      // Its middle shifts towards where the drop landed.
      p.x = (p.x * p.target + d.x * SPREAD) / (p.target + SPREAD);
      p.target += SPREAD;
    }
    this.drops.length = 0;
    this.drops.push(...keep);
  }

  private spread(dt: number) {
    for (const p of this.puddles) {
      p.w = Math.min(p.target, p.w + SPREAD_RATE * dt * (1 - p.w / (p.target + 1e-6)) + 0.02 * dt);
      // Can't run off the edge of a desk; it'd drip off, but let's say it pools at the edge.
      const half = Math.min(p.w, (p.x1 - p.x0) / 2);
      p.w = half;
      p.x = clamp(p.x, p.x0 + half, p.x1 - half);
    }
    // Puddles that touch run together.
    for (let i = 0; i < this.puddles.length; i++)
      for (let j = this.puddles.length - 1; j > i; j--) {
        const a = this.puddles[i];
        const b = this.puddles[j];
        if (Math.abs(a.y - b.y) > 0.02 || Math.abs(a.x - b.x) > a.w + b.w + 0.05) continue;
        const x0 = Math.min(a.x - a.w, b.x - b.w);
        const x1 = Math.max(a.x + a.w, b.x + b.w);
        a.x = (x0 + x1) / 2;
        a.w = (x1 - x0) / 2;
        a.target += b.target;
        this.puddles.splice(j, 1);
      }
  }

  /** The puddle under a point, if any. */
  puddleAt(p: Vec, reach = 0.12): Puddle | undefined {
    return this.puddles.find((q) => p.x > q.x - q.w && p.x < q.x + q.w && p.y > q.y - 0.05 && p.y < q.y + reach);
  }

  // ------------------------------------------------------ slick floor ---

  /** A foot in a puddle: no grip. Run into one and your feet go out from under you. */
  private underfoot(game: Game, dt: number): GameEvent[] {
    const events: GameEvent[] = [];
    const st = game.stanley;
    // Remember the tuning the job started with (an Overtime twist may have changed it).
    if (!this.base || (game.tuning !== this.base && game.tuning !== this.slickTuning)) {
      this.base = game.tuning;
      this.slickTuning = { ...this.base, traction: this.base.traction * SLICK };
    }
    this.slipCooldown = Math.max(0, this.slipCooldown - dt);
    let inPuddle: Vec | null = null;
    for (const leg of Object.values(st.rig.legs)) {
      const s = leg.shin.translation();
      const a = leg.shin.rotation();
      const foot = { x: s.x + Math.sin(a) * 0.22, y: s.y - Math.cos(a) * 0.22 };
      if (this.puddleAt(foot, 0.16)) inPuddle = foot;
    }
    this.slick = !!inPuddle && st.balance.grounded;
    game.tuning = this.slick ? this.slickTuning! : this.base;
    // Stepping into it at a run: splash, and maybe straight over.
    if (inPuddle && !this.wasIn) {
      const v = st.rig.pelvis.linvel();
      const speed = Math.abs(v.x);
      for (let i = 0; i < Math.min(8, Math.floor(speed * 3)); i++)
        this.add(inPuddle.x, inPuddle.y + 0.02, v.x * 0.4 + (game.rand() - 0.5), 0.6 + game.rand() * 1.2);
      if (this.slipCooldown === 0 && st.balance.posture === "up" && speed > 1.3 && game.rand() < clamp((speed - 1.3) / 1.2, 0.35, 1)) {
        this.slipCooldown = 1.5;
        const f = Math.sign(v.x) || st.facing;
        st.balance.knockDown(1.0);
        for (const l of Object.values(st.rig.legs)) l.shin.applyImpulse({ x: f * l.shin.mass() * 4.5, y: l.shin.mass() * 4 }, true);
        st.rig.chest.applyImpulse({ x: -f * st.rig.chest.mass() * 1.5, y: 0 }, true);
        events.push({ type: "ouch", text: "SLIPPED!", pos: { x: inPuddle.x, y: inPuddle.y + 1.4 } });
      }
    }
    this.wasIn = !!inPuddle;
    return events;
  }
}

// --------------------------------------------------------------- bits ---

const key = (cx: number, cy: number) => (cx + 4096) * 8192 + (cy + 4096);
const cell = (x: number, y: number) => key(Math.floor(x / H), Math.floor(y / H));

/** Stanley's limbs, as capsules for the coffee to splash off. */
function capsules(game: Game): Capsule[] {
  const r = game.stanley.rig;
  const out: Capsule[] = [
    { body: r.head, hl: 0, r: DIM.head.r },
    { body: r.chest, hl: DIM.chest.hh, r: DIM.chest.r },
    { body: r.pelvis, hl: DIM.pelvis.hh, r: DIM.pelvis.r },
  ];
  for (const arm of Object.values(r.arms)) {
    out.push({ body: arm.upper, hl: DIM.upperArm.len / 2, r: DIM.upperArm.r }, { body: arm.fore, hl: DIM.foreArm.len / 2, r: DIM.foreArm.r });
    out.push({ body: arm.hand, hl: 0, r: DIM.hand.r });
  }
  for (const leg of Object.values(r.legs)) out.push({ body: leg.thigh, hl: DIM.thigh.len / 2, r: DIM.thigh.r }, { body: leg.shin, hl: DIM.shin.len / 2, r: DIM.shin.r });
  return out;
}

function hitCapsule(d: Drop, c: Capsule) {
  const t = c.body.translation();
  const a = c.body.rotation();
  // Nearest point on the capsule's spine (along its local y).
  const ux = -Math.sin(a);
  const uy = Math.cos(a);
  const s = clamp((d.x - t.x) * ux + (d.y - t.y) * uy, -c.hl, c.hl);
  const qx = t.x + ux * s;
  const qy = t.y + uy * s;
  const dx = d.x - qx;
  const dy = d.y - qy;
  const r = Math.hypot(dx, dy);
  const min = c.r + R;
  if (r >= min || r < 1e-6) return;
  d.x = qx + (dx / r) * min;
  d.y = qy + (dy / r) * min;
}
