import type { Collider, RigidBody } from "@dimforge/rapier2d-deterministic-compat";
import { RAPIER, DT } from "../physics/world";
import { PROP_GROUPS } from "../physics/groups";
import type { Kit, Prop } from "./kit";
import type { Game, GameEvent } from "../sim/game";
import type { Renderer } from "../render/renderer";
import type { Stanley } from "../physics/body/stanley";
import { clamp, type Vec } from "../sim/math";

// Things that smash: panes of glass (and boarded-up walls) that stay put
// until something hits them hard enough, then burst into shards and let it
// through. Shared by Day Off's window and the Smash Room.

export type Material = "glass" | "wood";

export interface Pane {
  x: number;
  y: number;
  hw: number;
  hh: number;
  material: Material;
  /** Speed (m/s, straight at it) a thrown thing needs to smash it. */
  propSpeed: number;
  /** ...and Stanley needs. */
  bodySpeed: number;
  collider: Collider | null;
  broken: boolean;
  /** Smashed by Stanley himself (rather than something thrown). */
  byStanley: boolean;
  /** Cracks from hits that weren't quite hard enough (world-space polylines). */
  cracks: Vec[][];
  tag?: string;
  /** Seconds since it broke (for the drawn leftovers in the frame). */
  since: number;
}

/** Things moving slower than this (straight at a pane) just touch it. */
const CRACK_SPEED = 1.8;
/** Three cracks and it goes anyway. */
const CRACKS_TO_BREAK = 3;
/** Stanley running into glass this fast bounces off it, face first. */
const THUNK_SPEED = 2.4;
/** The fastest a thrown thing comes out the other side of a pane (m/s). */
const MAX_THROUGH = 9;
/** Shards kept lying about before the oldest are swept up. */
const MAX_SHARDS = 160;

const SHARD_COLORS: Record<Material, string[]> = {
  glass: ["rgba(205,234,246,0.92)", "rgba(170,214,236,0.92)", "rgba(235,248,255,0.95)", "rgba(150,200,225,0.9)"],
  wood: ["#b98a4f", "#a0703f", "#c9a06a", "#8a5e3c"],
};

export class Panes {
  readonly list: Pane[] = [];
  private shards: Prop[] = [];
  private cooldown = new Map<Pane, number>();
  private thunk = 0;

  constructor(private kit: Kit) {}

  add(x: number, y: number, hw: number, hh: number, o: { material?: Material; propSpeed?: number; bodySpeed?: number; tag?: string } = {}): Pane {
    const collider = this.kit.solid(x, y, hw, hh, "wall", { hidden: true, friction: 0.3 });
    const pane: Pane = {
      x,
      y,
      hw,
      hh,
      material: o.material ?? "glass",
      propSpeed: o.propSpeed ?? 3.2,
      bodySpeed: o.bodySpeed ?? 4,
      collider,
      broken: false,
      byStanley: false,
      cracks: [],
      tag: o.tag,
      since: 0,
    };
    this.list.push(pane);
    return pane;
  }

  get smashed() {
    return this.list.filter((p) => p.broken).length;
  }

  /**
   * Call every step. Looks ahead: anything about to hit a pane hard enough
   * smashes it *before* the physics gets a chance to bounce it off, so it
   * carries on through, the way it should.
   */
  update(game: Game, dt: number): GameEvent[] {
    const ev: GameEvent[] = [];
    this.thunk = Math.max(0, this.thunk - dt);
    for (const [p, t] of this.cooldown) this.cooldown.set(p, t - dt);
    const st = game.stanley;
    const movers: { body: RigidBody; r: number; stanley: boolean }[] = [
      // Stanley smashes things with his head and body, not his hands (punching
      // through every pane would be no fun; throwing things at them is).
      ...[st.rig.head, st.rig.chest, st.rig.pelvis, st.rig.legs.L.thigh, st.rig.legs.R.thigh].map((body) => ({ body, r: body === st.rig.head ? 0.22 : 0.17, stanley: true })),
      ...game.props.filter((p) => p.kind !== "shard").map((p) => ({ body: p.body, r: p.kind === "ball" ? p.hw : Math.hypot(p.hw, p.hh), stanley: false })),
    ];
    for (const pane of this.list) {
      if (pane.broken) {
        pane.since += dt;
        continue;
      }
      for (const m of movers) {
        const p = m.body.translation();
        const v = m.body.linvel();
        const speed = Math.hypot(v.x, v.y);
        const c = { x: clamp(p.x, pane.x - pane.hw, pane.x + pane.hw), y: clamp(p.y, pane.y - pane.hh, pane.y + pane.hh) };
        const dx = p.x - c.x;
        const dy = p.y - c.y;
        const dist = Math.hypot(dx, dy);
        if (dist > m.r + speed * DT * 2.5 + 0.03) continue;
        const n = dist > 1e-6 ? { x: dx / dist, y: dy / dist } : speed > 0 ? { x: -v.x / speed, y: -v.y / speed } : { x: 0, y: 1 };
        const approach = -(v.x * n.x + v.y * n.y);
        const need = m.stanley ? pane.bodySpeed : pane.propSpeed;
        if (approach >= need) {
          ev.push(...this.smash(game, pane, c, v, m.stanley));
          // Whatever went through carries on, a little slower (and never at a silly speed,
          // so one wild throw can't take out every pane in the building).
          if (!m.stanley) {
            const k = Math.min(0.75, MAX_THROUGH / Math.max(speed, 1e-6));
            m.body.setLinvel({ x: v.x * k, y: v.y * k }, true);
          }
          break;
        }
        if ((this.cooldown.get(pane) ?? 0) > 0) continue;
        if (!m.stanley && approach >= CRACK_SPEED) {
          this.cooldown.set(pane, 0.25);
          pane.cracks.push(this.crack(c, game.rand));
          ev.push({ type: "sfx", name: "crack", pos: c });
          if (pane.cracks.length >= CRACKS_TO_BREAK) {
            ev.push(...this.smash(game, pane, c, v, false));
            break;
          }
        } else if (
          m.stanley &&
          (m.body === st.rig.head || m.body === st.rig.chest) &&
          Math.abs(st.rig.pelvis.linvel().x) >= THUNK_SPEED &&
          approach >= THUNK_SPEED &&
          this.thunk === 0 &&
          st.balance.posture === "up"
        ) {
          // Ran into it. Glass: still there. Stanley: briefly not.
          this.thunk = 1;
          this.cooldown.set(pane, 0.6);
          st.balance.knockDown(0.6);
          const ch = st.rig.chest;
          ch.applyImpulse({ x: n.x * ch.mass() * 1.5, y: ch.mass() * 0.4 }, true);
          ev.push({ type: "ouch", text: pane.material === "glass" ? "THUNK." : "BONK.", pos: { x: c.x, y: c.y + 0.4 } });
          if (pane.material === "glass" && pane.cracks.length < CRACKS_TO_BREAK - 1) pane.cracks.push(this.crack({ x: c.x, y: clamp(st.rig.head.translation().y, pane.y - pane.hh, pane.y + pane.hh) }, game.rand));
        }
      }
    }
    return ev;
  }

  /** Break a pane now (whatever hit it, or nothing). */
  smash(game: Game, pane: Pane, at: Vec, vel: Vec, byStanley: boolean): GameEvent[] {
    if (pane.broken) return [];
    pane.broken = true;
    pane.byStanley = byStanley;
    pane.since = 0;
    if (pane.collider) game.world.removeCollider(pane.collider, true);
    pane.collider = null;
    // Shards burst out the way it was going, fastest near where it hit.
    const r = game.rand;
    const area = pane.hw * pane.hh * 4;
    const n = Math.round(clamp(area * 26, 8, 30));
    const colors = SHARD_COLORS[pane.material];
    for (let i = 0; i < n; i++) {
      const x = pane.x + (r() * 2 - 1) * pane.hw;
      const y = pane.y + (r() * 2 - 1) * pane.hh;
      const near = 1 / (1 + Math.hypot(x - at.x, y - at.y) * 1.5);
      const size = pane.material === "wood" ? 0.06 + r() * 0.1 : 0.04 + r() * 0.08;
      const pts: Vec[] = [];
      const k = 3 + Math.floor(r() * 2);
      for (let j = 0; j < k; j++) {
        const a = (j / k) * Math.PI * 2 + r() * 0.8;
        const rr = size * (0.5 + r() * 0.6) * (pane.material === "wood" && j % 2 ? 0.35 : 1);
        pts.push({ x: Math.cos(a) * rr * (pane.material === "wood" ? 1.8 : 1), y: Math.sin(a) * rr });
      }
      const desc = RAPIER.ColliderDesc.convexHull(new Float32Array(pts.flatMap((q) => [q.x, q.y])));
      if (!desc) continue;
      const push = 0.25 + near * 0.55;
      const body = game.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(x, y)
          .setRotation(r() * 6.28)
          .setLinvel(vel.x * push + (r() - 0.5) * 2.5, vel.y * push + (r() - 0.3) * 2.5)
          .setAngvel((r() - 0.5) * 24)
          .setCcdEnabled(true),
      );
      game.world.createCollider(desc.setDensity(5).setFriction(0.8).setRestitution(0.25).setCollisionGroups(PROP_GROUPS), body);
      const shard: Prop = { kind: "shard", body, hw: size, hh: size, color: colors[i % colors.length], shape: pts };
      game.props.push(shard);
      this.shards.push(shard);
    }
    // Sweep up the oldest, so a long session doesn't fill up with glass.
    while (this.shards.length > MAX_SHARDS) {
      const old = this.shards.shift()!;
      if (game.props.includes(old)) game.removeProp(old);
    }
    // Going through takes a little out of him.
    if (byStanley) for (const b of game.stanley.rig.bodies) b.setLinvel({ x: b.linvel().x * 0.86, y: b.linvel().y * 0.86 }, true);
    return [{ type: "smash", pos: at, material: pane.material, big: byStanley || area > 1.5 }];
  }

  /** A crack radiating from where it was hit. */
  private crack(at: Vec, r: () => number): Vec[] {
    const pts = [at];
    let a = r() * Math.PI * 2;
    let p = at;
    for (let i = 0; i < 4; i++) {
      a += (r() - 0.5) * 1.4;
      const len = 0.08 + r() * 0.14;
      p = { x: p.x + Math.cos(a) * len, y: p.y + Math.sin(a) * len };
      pts.push(p);
    }
    return pts;
  }

  draw(r: Renderer, time: number) {
    for (const p of this.list) drawPane(r, p, time);
  }
}

/** A pane as it looks: glass with a shine (and its cracks), or boards; jagged leftovers once smashed. */
export function drawPane(r: Renderer, p: Pane, time: number) {
  const x0 = p.x - p.hw;
  const x1 = p.x + p.hw;
  const y0 = p.y - p.hh;
  const y1 = p.y + p.hh;
  if (p.material === "wood") {
    if (p.broken) {
      // Splintered stubs top and bottom.
      for (let i = 0; i < 3; i++) {
        const t = (i + 0.5) / 3;
        r.poly([{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y0 + 0.15 + t * 0.2 }, { x: x0, y: y0 + 0.3 - t * 0.1 }], "#8a5e3c");
        r.poly([{ x: x0, y: y1 }, { x: x1, y: y1 }, { x: x1, y: y1 - 0.2 - t * 0.1 }, { x: x0, y: y1 - 0.1 - t * 0.2 }], "#8a5e3c");
      }
      return;
    }
    r.rect(x0, y0, x1, y1, "#8a5e3c");
    const boards = Math.max(3, Math.round((p.hh * 2) / 0.28));
    for (let i = 0; i < boards; i++) {
      const by = y0 + ((y1 - y0) * (i + 0.5)) / boards;
      r.rect(x0 - 0.03, by - 0.11, x1 + 0.03, by + 0.11, i % 2 ? "#b98a4f" : "#a87a45");
      r.circle({ x: p.x, y: by }, 0.018, "#5b4330");
    }
    return;
  }
  if (p.broken) {
    // Jagged teeth of glass left in the frame.
    const teeth = (edge: number, dir: number) => {
      const pts: Vec[] = [{ x: x0, y: edge }];
      const n = 4;
      for (let i = 0; i <= n; i++) pts.push({ x: x0 + ((x1 - x0) * i) / n, y: edge + dir * (i % 2 ? 0.08 : 0.25) });
      pts.push({ x: x1, y: edge });
      r.poly(pts, "rgba(190,228,244,0.7)");
    };
    if (p.hh > p.hw) {
      teeth(y0, 1);
      teeth(y1, -1);
    }
    return;
  }
  r.rect(x0, y0, x1, y1, "rgba(180,222,240,0.45)");
  r.rect(x0, y0, x0 + Math.min(0.03, p.hw * 0.5), y1, "rgba(255,255,255,0.6)");
  // A slow glint sliding up the glass.
  const h = y1 - y0;
  const g = y0 + ((time * 0.35 + p.x * 0.13) % 1.6) * h - h * 0.3;
  const gy0 = clamp(g, y0, y1);
  const gy1 = clamp(g + Math.min(0.5, h * 0.3), y0, y1);
  if (gy1 > gy0) r.rect(x0, gy0, x1, gy1, "rgba(255,255,255,0.35)");
  for (const c of p.cracks) for (let i = 1; i < c.length; i++) r.line(c[i - 1], c[i], 0.012, "rgba(255,255,255,0.95)");
}

/**
 * Launch Stanley head first (a springboard, a cannon, a bad idea): tip him
 * over so his head leads, send him off at `vel`, and let him go limp.
 */
export function launchHeadFirst(st: Stanley, vel: Vec) {
  const bodies = st.rig.bodies;
  let m = 0;
  let cx = 0;
  let cy = 0;
  for (const b of bodies) {
    const k = b.mass();
    const p = b.translation();
    m += k;
    cx += p.x * k;
    cy += p.y * k;
  }
  cx /= m;
  cy /= m;
  const dir = Math.sign(vel.x) || st.facing;
  const a = -dir * 1.25;
  const c = Math.cos(a);
  const s = Math.sin(a);
  for (const b of bodies) {
    const p = b.translation();
    const dx = p.x - cx;
    const dy = p.y - cy;
    b.setTranslation({ x: cx + dx * c - dy * s, y: cy + dx * s + dy * c }, true);
    b.setRotation(b.rotation() + a, true);
    b.setLinvel(vel, true);
    b.setAngvel(0, true);
  }
  st.balance.knockDown(1.1);
  // A stunt, not a fall.
  st.stunt = true;
}

/** Make a prop mid-level and hand it to the game (kit.box adds to the kit's list, which the game may have replaced). */
export function spawnProp(kit: Kit, game: Game, make: () => Prop): Prop {
  const p = make();
  const i = kit.props.indexOf(p);
  if (i >= 0) kit.props.splice(i, 1);
  game.props.push(p);
  return p;
}
