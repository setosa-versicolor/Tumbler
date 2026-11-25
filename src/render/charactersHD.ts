import type { RigidBody } from "@dimforge/rapier2d-deterministic-compat";
import type { Renderer } from "./renderer";
import type { Game } from "../sim/game";
import { DIM, type Side } from "../physics/body/rig";
import type { Vec } from "../sim/math";

// The characters in high-end graphics. Clean cut-out vector art: every limb
// chain gets one ink outline (so joints are seamless), flat colour with a
// shadow side and a highlight, and faces with some life in them. Every shape
// sits on the physics rig's bodies, so the ragdoll moves exactly as before.
//
// Everything is drawn in world metres, y up (see `world`). Inside a body's
// frame (`local`), x points the way Stanley faces.

type Ctx = CanvasRenderingContext2D;

const INK = "#2a2230";
/** Outline width, metres. */
const LINE = 0.016;

// ------------------------------------------------------------- colours ---

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** Darker (k < 0) or lighter (k > 0). Returns #rrggbb, so it can be shaded again. */
export function shade(c: string, k: number): string {
  const [r, g, b] = hex(c);
  const t = k < 0 ? 0 : 255;
  const a = Math.abs(k);
  const m = (v: number) => Math.round(v + (t - v) * a);
  return "#" + ((1 << 24) | (m(r) << 16) | (m(g) << 8) | m(b)).toString(16).slice(1);
}
const rgba = (c: string, a: number) => {
  const [r, g, b] = hex(c);
  return `rgba(${r},${g},${b},${a})`;
};

const STAN = {
  skin: "#f4c69a",
  shirt: "#2fa49a",
  pants: "#33416c",
  cap: "#f28a3a",
  hair: "#6e4527",
  shoe: "#6b4330",
  sole: "#2b211d",
  belt: "#3b2a22",
  brass: "#e0b85a",
  iris: "#6b4426",
};
/** Things on the far side of him are a little darker. */
const FAR = -0.16;

// --------------------------------------------------------- transforms ---

/** Draw in world metres, y up. */
function world(r: Renderer, fn: (ctx: Ctx) => void) {
  const ctx = r.ctx;
  const c = r.camera;
  const s = c.scale;
  ctx.save();
  ctx.translate(c.w / 2 - c.x * s, c.h / 2 + c.y * s);
  ctx.scale(s, -s);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  fn(ctx);
  ctx.restore();
}

/** Within world space: move to `at`, turn by `angle`, and face `f` (x forward). */
function local(ctx: Ctx, at: Vec, angle: number, f: number, fn: () => void) {
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.rotate(angle);
  ctx.scale(f, 1);
  fn();
  ctx.restore();
}

/** Ends of a limb body (top, bottom) in world space. */
function ends(b: RigidBody, len: number): [Vec, Vec] {
  const p = b.translation();
  const a = b.rotation();
  const ux = -Math.sin(a) * (len / 2);
  const uy = Math.cos(a) * (len / 2);
  return [
    { x: p.x + ux, y: p.y + uy },
    { x: p.x - ux, y: p.y - uy },
  ];
}

/** A capsule from a (radius ra) to b (radius rb), as a path. */
function capsule(ctx: Ctx, a: Vec, b: Vec, ra: number, rb: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const ang = Math.atan2(dy, dx);
  const N = 10;
  ctx.beginPath();
  // Round the far end, from one side to the other.
  for (let i = 0; i <= N; i++) {
    const t = ang - Math.PI / 2 + (i / N) * Math.PI;
    ctx.lineTo(b.x + Math.cos(t) * rb, b.y + Math.sin(t) * rb);
  }
  for (let i = 0; i <= N; i++) {
    const t = ang + Math.PI / 2 + (i / N) * Math.PI;
    ctx.lineTo(a.x + Math.cos(t) * ra, a.y + Math.sin(t) * ra);
  }
  ctx.closePath();
}

/** Ink outline round a path, then its fill: outline everything in a chain first, so joints are seamless. */
function outline(ctx: Ctx, path: () => void, width = LINE) {
  path();
  ctx.strokeStyle = INK;
  ctx.lineWidth = width * 2;
  ctx.stroke();
}
function fill(ctx: Ctx, path: () => void, color: string | CanvasGradient) {
  path();
  ctx.fillStyle = color;
  ctx.fill();
}

/** Shade a shape already drawn: a shadow band down one side, a highlight down the other (clipped to `path`). */
function cel(ctx: Ctx, path: () => void, base: string, shadow: () => void, light?: () => void) {
  ctx.save();
  path();
  ctx.clip();
  ctx.fillStyle = shade(base, -0.22);
  shadow();
  if (light) {
    ctx.fillStyle = rgba("#ffffff", 0.22);
    light();
  }
  ctx.restore();
}

function line(ctx: Ctx, color: string, width: number, pts: [number, number][]) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  for (const [x, y] of pts) ctx.lineTo(x, y);
  ctx.stroke();
}

function oval(ctx: Ctx, x: number, y: number, rx: number, ry: number, color: string, rot = 0) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fill();
}

/** Logo text the right way up inside a (possibly mirrored, y-up) frame. */
function label(ctx: Ctx, text: string, x: number, y: number, size: number, color: string, f: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(f * 0.001, -0.001);
  ctx.font = `900 ${Math.round(size * 1000)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(text, 0, size * 60);
  ctx.restore();
}

// ------------------------------------------------------------- stanley ---

/** A damped spring: value, velocity. */
interface Spring {
  x: number;
  v: number;
}
function spring(s: Spring, force: number, k: number, damp: number, dt: number, max: number) {
  s.v += (force - k * s.x - damp * s.v) * dt;
  s.x = Math.max(-max, Math.min(max, s.x + s.v * dt));
}

/** A point on the lanyard (verlet). */
interface Knot {
  x: number;
  y: number;
  px: number;
  py: number;
}

/**
 * Stanley's look from frame to frame: blinking, and the bits that swing about
 * after him (they're only drawn, so the physics doesn't feel them).
 */
export interface StanleyLook {
  blink: number;
  /** Cap brim flex, back hair sway, shirt hem flutter (radians / metres). */
  brim?: Spring;
  hair?: Spring;
  hem?: Spring;
  /** Squash (+) and stretch (-) about his feet, after a landing or a jump. */
  squash?: Spring;
  /** The lanyard's knots, collar to badge. */
  cord?: Knot[];
  /** Last frame's head and hips, and their velocities, to feel the jolts. */
  prev?: { head: Vec; hip: Vec; hv: Vec; pv: Vec };
}

const CORD_KNOTS = 6;
const CORD_SEG = 0.04;
/** Where the lanyard hangs from: the front of the collar, in the chest's frame (x forward). */
const CORD_ANCHOR = { x: 0.125, y: 0.24 };

/** Move the swinging bits on by `dt`, from how the body moved since last frame. */
function swing(look: StanleyLook, game: Game, dt: number) {
  const st = game.stanley;
  const rig = st.rig;
  look.brim ??= { x: 0, v: 0 };
  look.hair ??= { x: 0, v: 0 };
  look.hem ??= { x: 0, v: 0 };
  look.squash ??= { x: 0, v: 0 };
  const head = { ...rig.head.translation() };
  const hip = { ...rig.pelvis.translation() };
  const anchor = chestPoint(rig.chest, CORD_ANCHOR, st.facing);
  const prev = look.prev;
  // Teleported (or the first frame): settle everything at rest.
  const jumped = !prev || Math.hypot(head.x - prev.head.x, head.y - prev.head.y) > 0.6;
  if (jumped || !look.cord) {
    look.cord = Array.from({ length: CORD_KNOTS }, (_, i) => {
      const y = anchor.y - i * CORD_SEG;
      return { x: anchor.x, y, px: anchor.x, py: y };
    });
  }
  if (jumped || dt <= 0) {
    look.prev = { head, hip, hv: prev?.hv ?? { x: 0, y: 0 }, pv: prev?.pv ?? { x: 0, y: 0 } };
    return;
  }
  const hv = { x: (head.x - prev.head.x) / dt, y: (head.y - prev.head.y) / dt };
  const pv = { x: (hip.x - prev.hip.x) / dt, y: (hip.y - prev.hip.y) / dt };
  // Accelerations, clamped (a frame hitch shouldn't fling things).
  const cl = (v: number) => Math.max(-60, Math.min(60, v));
  const ha = { x: cl((hv.x - prev.hv.x) / dt), y: cl((hv.y - prev.hv.y) / dt) };
  const pa = { x: cl((pv.x - prev.pv.x) / dt), y: cl((pv.y - prev.pv.y) / dt) };
  look.prev = { head, hip, hv, pv };
  const f = st.facing;
  // The brim flexes against the head's jolts (down when he lands, up when he jumps); the hair lags behind.
  spring(look.brim, -ha.y * 0.012 - ha.x * f * 0.004, 260, 9, dt, 0.32);
  spring(look.hair, ha.x * f * 0.02 + hv.x * f * 0.0, 120, 6, dt, 0.4);
  // The hem flutters with the hips' bounce, and trails when he runs.
  spring(look.hem, pa.y * 0.0018 - Math.abs(pv.x) * 0.12, 180, 8, dt, 0.05);
  // Squash on a hard landing (the hips stopping fast), stretch on take-off.
  // (A kick to the spring's speed: about 0.13 of squash per unit of kick at this stiffness.)
  const landing = pa.y > 18 && pv.y > -0.5 && pv.y < 1 ? Math.min(3.2, (pa.y - 18) * 0.11) : 0;
  const takeoff = pa.y > 18 && pv.y > 1.5 ? -Math.min(2.4, (pa.y - 18) * 0.09) : 0;
  look.squash.v += landing + takeoff;
  spring(look.squash, 0, 220, 11, dt, 0.22);
  // The lanyard: verlet knots, pinned at the collar, a few steps at a time.
  const steps = Math.min(8, Math.ceil(dt / (1 / 120)));
  const h = dt / steps;
  const g = 9.8;
  const cord = look.cord!;
  for (let s = 0; s < steps; s++) {
    for (const k of cord.slice(1)) {
      const vx = (k.x - k.px) * 0.985;
      const vy = (k.y - k.py) * 0.985;
      k.px = k.x;
      k.py = k.y;
      k.x += vx;
      k.y += vy - g * h * h;
    }
    for (let it = 0; it < 4; it++) {
      cord[0].x = anchor.x;
      cord[0].y = anchor.y;
      for (let i = 1; i < cord.length; i++) {
        const a = cord[i - 1];
        const b = cord[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1e-6;
        const diff = (d - CORD_SEG) / d;
        if (i === 1) {
          b.x -= dx * diff;
          b.y -= dy * diff;
        } else {
          a.x += dx * diff * 0.5;
          a.y += dy * diff * 0.5;
          b.x -= dx * diff * 0.5;
          b.y -= dy * diff * 0.5;
        }
      }
    }
  }
  cord[0].px = cord[0].x;
  cord[0].py = cord[0].y;
}

/** A point given in the chest's frame (x forward), in the world. */
function chestPoint(chest: RigidBody, p: Vec, f: number): Vec {
  const c = chest.translation();
  const a = chest.rotation();
  const x = p.x * f;
  return { x: c.x + x * Math.cos(a) - p.y * Math.sin(a), y: c.y + x * Math.sin(a) + p.y * Math.cos(a) };
}

/** The lanyard down the front of the shirt, and the Odd Jobs ID badge on the end. */
function lanyard(ctx: Ctx, cord: Knot[], f: number) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.022;
  ctx.beginPath();
  for (const k of cord) ctx.lineTo(k.x, k.y);
  ctx.stroke();
  ctx.strokeStyle = "#e85d4f";
  ctx.lineWidth = 0.011;
  ctx.stroke();
  const end = cord[cord.length - 1];
  const before = cord[cord.length - 2];
  // The badge hangs along the cord's last stretch.
  const ang = Math.atan2(end.y - before.y, end.x - before.x) + Math.PI / 2;
  local(ctx, end, ang, 1, () => {
    ctx.beginPath();
    ctx.roundRect(-0.038, -0.1, 0.076, 0.1, 0.01);
    ctx.strokeStyle = INK;
    ctx.lineWidth = LINE * 1.2;
    ctx.stroke();
    ctx.fillStyle = "#f6f3ec";
    ctx.fill();
    ctx.fillStyle = STAN.cap;
    ctx.fillRect(-0.038, -0.028, 0.076, 0.02);
    // A tiny photo of Stanley, and his name in lines.
    ctx.fillStyle = "#b9d4e6";
    ctx.fillRect(-0.028, -0.07, 0.026, 0.032);
    oval(ctx, -0.015, -0.05, 0.008, 0.008, STAN.skin);
    oval(ctx, -0.015, -0.044, 0.009, 0.004, STAN.cap);
    for (const y of [-0.05, -0.062]) line(ctx, rgba(INK, 0.5), 0.004, [[0.004, y], [0.026, y]]);
    ctx.fillStyle = "#9aa0a8";
    ctx.fillRect(-0.008, -0.004, 0.016, 0.012);
  });
  void f;
}

interface Mood {
  down: boolean;
  air: boolean;
  strain: boolean;
  blink: boolean;
  gaze: Vec;
}

/** Stanley: polo shirt, chinos, belt, work shoes, the cap, and a face that shows how it's going. */
export function drawStanleyHD(r: Renderer, game: Game, look: StanleyLook, dt: number) {
  const st = game.stanley;
  const rig = st.rig;
  const f = st.facing;
  const back: Side = f > 0 ? "L" : "R";
  const front: Side = f > 0 ? "R" : "L";
  look.blink -= dt;
  if (look.blink < -3.4) look.blink = 0.13;
  swing(look, game, dt);
  const hp = rig.head.translation();
  const mood: Mood = {
    down: st.balance.posture === "down",
    air: !st.balance.grounded && st.balance.posture !== "down",
    strain: !!(st.grips.L.held?.isDynamic() || st.grips.R.held?.isDynamic()),
    blink: look.blink > 0,
    gaze: st.lookAt ? { x: st.lookAt.x - hp.x, y: st.lookAt.y - hp.y } : { x: f, y: -0.1 },
  };
  world(r, (ctx) => {
    // Squash and stretch, about the ground under him.
    const sq = look.squash!.x;
    if (sq) {
      const p = rig.pelvis.translation();
      const gy = Number.isFinite(st.balance.groundDist) ? p.y - st.balance.groundDist : p.y - DIM.standHeight;
      ctx.translate(p.x, gy);
      ctx.scale(1 + sq * 0.7, 1 - sq);
      ctx.translate(-p.x, -gy);
    }
    arm(ctx, game, back, f, FAR);
    leg(ctx, game, back, f, FAR);
    leg(ctx, game, front, f, 0);
    hips(ctx, rig.pelvis, f);
    neck(ctx, rig.chest, rig.head);
    shirt(ctx, rig.chest, f, look.hem!.x);
    belt(ctx, rig.pelvis, f);
    lanyard(ctx, look.cord!, f);
    head(ctx, rig.head, f, mood, look.brim!.x, look.hair!.x);
    arm(ctx, game, front, f, 0);
  });
}

// ---- arms

function arm(ctx: Ctx, game: Game, side: Side, f: number, dim: number) {
  const a = game.stanley.rig.arms[side];
  const gripping = !!game.stanley.grips[side].held;
  const skin = shade(STAN.skin, dim);
  const shirt = shade(STAN.shirt, dim);
  const [sh, el] = ends(a.upper, DIM.upperArm.len);
  const [, wr] = ends(a.fore, DIM.foreArm.len);
  const hand = a.hand.translation();
  const fa = a.fore.rotation();
  const sleeveEnd = { x: sh.x + (el.x - sh.x) * 0.58, y: sh.y + (el.y - sh.y) * 0.58 };
  const upper = () => capsule(ctx, sh, el, 0.058, 0.052);
  const fore = () => capsule(ctx, el, wr, 0.052, 0.04);
  const sleeve = () => capsule(ctx, sh, sleeveEnd, 0.07, 0.064);
  const palm = () => handPath(ctx, hand, fa, f, gripping);
  // One outline round the whole arm, then the fills.
  for (const p of [upper, fore, palm, sleeve]) outline(ctx, p);
  fill(ctx, upper, skin);
  fill(ctx, fore, skin);
  fill(ctx, palm, skin);
  // Shadow down the underside of the arm.
  for (const [p, q0, q1, rr] of [
    [upper, sh, el, 0.058],
    [fore, el, wr, 0.05],
  ] as const) {
    cel(ctx, p, skin, () => {
      const n = sideways(q0, q1, -f);
      capsule(ctx, { x: q0.x + n.x * rr * 0.9, y: q0.y + n.y * rr * 0.9 }, { x: q1.x + n.x * rr * 0.9, y: q1.y + n.y * rr * 0.9 }, rr * 0.7, rr * 0.7);
      ctx.fill();
    });
  }
  handDetail(ctx, hand, fa, f, skin, gripping);
  // The short sleeve, with a hem and a crease.
  fill(ctx, sleeve, shirt);
  cel(ctx, sleeve, shirt, () => {
    const n = sideways(sh, sleeveEnd, -f);
    capsule(ctx, { x: sh.x + n.x * 0.06, y: sh.y + n.y * 0.06 }, { x: sleeveEnd.x + n.x * 0.055, y: sleeveEnd.y + n.y * 0.055 }, 0.05, 0.045);
    ctx.fill();
  });
  const d = norm(sh, sleeveEnd);
  const hem = { x: sleeveEnd.x - d.x * 0.03, y: sleeveEnd.y - d.y * 0.03 };
  const n = { x: -d.y, y: d.x };
  line(ctx, shade(shirt, -0.35), 0.008, [
    [hem.x + n.x * 0.06, hem.y + n.y * 0.06],
    [hem.x - n.x * 0.06, hem.y - n.y * 0.06],
  ]);
}

function norm(a: Vec, b: Vec): Vec {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  return { x: dx / l, y: dy / l };
}
/** The unit normal to a→b on the side `s` (+1 left of the direction of travel). */
function sideways(a: Vec, b: Vec, s: number): Vec {
  const d = norm(a, b);
  return { x: -d.y * s, y: d.x * s };
}

/** The hand's outline: a mitten with a thumb, or a fist. */
function handPath(ctx: Ctx, at: Vec, angle: number, f: number, gripping: boolean) {
  const R = DIM.hand.r;
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.rotate(angle);
  ctx.scale(f, 1);
  ctx.beginPath();
  if (gripping) ctx.roundRect(-R * 0.85, -R * 0.9, R * 1.75, R * 1.65, R * 0.55);
  else {
    ctx.roundRect(-R * 0.72, -R * 1.25, R * 1.4, R * 1.95, R * 0.62);
    // Thumb, forward.
    ctx.roundRect(R * 0.25, -R * 0.55, R * 0.75, R * 0.42, R * 0.21);
  }
  ctx.restore();
}

function handDetail(ctx: Ctx, at: Vec, angle: number, f: number, skin: string, gripping: boolean) {
  const R = DIM.hand.r;
  const crease = shade(skin, -0.35);
  local(ctx, at, angle, f, () => {
    if (gripping) {
      // Knuckles and the curled thumb across the front.
      for (let i = 0; i < 3; i++) line(ctx, crease, 0.006, [[R * 0.5, -R * 0.55 + i * R * 0.38], [R * 0.85, -R * 0.55 + i * R * 0.38]]);
      ctx.beginPath();
      ctx.roundRect(-R * 0.25, -R * 0.15, R * 1.05, R * 0.4, R * 0.2);
      ctx.fillStyle = shade(skin, 0.08);
      ctx.fill();
      ctx.strokeStyle = crease;
      ctx.lineWidth = 0.006;
      ctx.stroke();
    } else {
      // Finger lines.
      for (const x of [-0.2, 0.15]) line(ctx, crease, 0.005, [[x * R, -R * 1.15], [x * R, -R * 0.7]]);
      oval(ctx, -R * 0.25, -R * 0.1, R * 0.25, R * 0.4, rgba("#ffffff", 0.18));
    }
  });
}

// ---- legs

function leg(ctx: Ctx, game: Game, side: Side, f: number, dim: number) {
  const l = game.stanley.rig.legs[side];
  const pants = shade(STAN.pants, dim);
  const [hip, knee] = ends(l.thigh, DIM.thigh.len);
  const [, ankle] = ends(l.shin, DIM.shin.len);
  const thigh = () => capsule(ctx, hip, knee, 0.095, 0.08);
  const shin = () => capsule(ctx, knee, ankle, 0.08, 0.072);
  const sa = l.shin.rotation();
  const shoe = () => shoePath(ctx, l.shin, f);
  for (const p of [thigh, shin, shoe]) outline(ctx, p);
  fill(ctx, shoe, shade(STAN.shoe, dim));
  shoeDetail(ctx, l.shin, f, dim);
  fill(ctx, thigh, pants);
  fill(ctx, shin, pants);
  // Back of the leg in shadow; a pressed crease down the front.
  for (const [p, a, b, rr] of [
    [thigh, hip, knee, 0.09],
    [shin, knee, ankle, 0.078],
  ] as const) {
    cel(ctx, p, pants, () => {
      const n = sideways(a, b, -f);
      capsule(ctx, { x: a.x + n.x * rr, y: a.y + n.y * rr }, { x: b.x + n.x * rr, y: b.y + n.y * rr }, rr * 0.6, rr * 0.6);
      ctx.fill();
    });
    const n = sideways(a, b, f);
    line(ctx, rgba("#ffffff", 0.16), 0.007, [
      [a.x + n.x * rr * 0.45, a.y + n.y * rr * 0.45],
      [b.x + n.x * rr * 0.45, b.y + n.y * rr * 0.45],
    ]);
  }
  // Knee fold, and the hem over the shoe.
  local(ctx, l.shin.translation(), sa, f, () => {
    const h = DIM.shin.len / 2;
    line(ctx, shade(pants, -0.35), 0.007, [[-0.04, h - 0.01], [0.0, h - 0.04], [0.05, h - 0.02]]);
    line(ctx, shade(pants, -0.3), 0.008, [[-0.075, -h + 0.02], [0.075, -h + 0.02]]);
  });
}

/** A leather work shoe in the shin's frame: heel under the ankle, toe forward, sole on the ground. */
function shoePath(ctx: Ctx, shin: RigidBody, f: number) {
  const y0 = -DIM.shin.len / 2 - DIM.shin.r;
  const p = shin.translation();
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(shin.rotation());
  ctx.scale(f, 1);
  ctx.beginPath();
  ctx.moveTo(-0.08, y0);
  ctx.lineTo(-0.085, y0 + 0.09);
  ctx.quadraticCurveTo(-0.02, y0 + 0.115, 0.055, y0 + 0.09);
  ctx.quadraticCurveTo(0.17, y0 + 0.075, 0.185, y0 + 0.025);
  ctx.quadraticCurveTo(0.19, y0, 0.16, y0);
  ctx.closePath();
  ctx.restore();
}

function shoeDetail(ctx: Ctx, shin: RigidBody, f: number, dim: number) {
  const y0 = -DIM.shin.len / 2 - DIM.shin.r;
  const leather = shade(STAN.shoe, dim);
  local(ctx, shin.translation(), shin.rotation(), f, () => {
    // Sole, a shine on the toe cap, laces.
    ctx.fillStyle = STAN.sole;
    ctx.fillRect(-0.085, y0 - 0.002, 0.27, 0.022);
    oval(ctx, 0.12, y0 + 0.055, 0.035, 0.013, rgba("#ffffff", 0.3), -0.35);
    for (let i = 0; i < 3; i++) line(ctx, shade(leather, -0.5), 0.007, [[-0.005 + i * 0.024, y0 + 0.088 - i * 0.006], [0.012 + i * 0.024, y0 + 0.072 - i * 0.006]]);
  });
}

// ---- body

/** Chinos round the hips. */
function hips(ctx: Ctx, pelvis: RigidBody, f: number) {
  const shape = () => {
    ctx.save();
    ctx.translate(pelvis.translation().x, pelvis.translation().y);
    ctx.rotate(pelvis.rotation());
    ctx.scale(f, 1);
    ctx.beginPath();
    ctx.moveTo(-0.165, 0.16);
    ctx.lineTo(0.17, 0.16);
    ctx.quadraticCurveTo(0.185, -0.02, 0.15, -0.11);
    ctx.quadraticCurveTo(0.0, -0.17, -0.15, -0.11);
    ctx.quadraticCurveTo(-0.185, -0.02, -0.165, 0.16);
    ctx.closePath();
    ctx.restore();
  };
  outline(ctx, shape);
  fill(ctx, shape, STAN.pants);
  cel(ctx, shape, STAN.pants, () => {
    local(ctx, pelvis.translation(), pelvis.rotation(), f, () => ctx.fillRect(-0.2, -0.2, 0.11, 0.4));
  });
  // Fly seam.
  local(ctx, pelvis.translation(), pelvis.rotation(), f, () => {
    line(ctx, shade(STAN.pants, -0.35), 0.007, [[0.12, 0.14], [0.125, -0.02], [0.08, -0.08]]);
  });
}

function belt(ctx: Ctx, pelvis: RigidBody, f: number) {
  local(ctx, pelvis.translation(), pelvis.rotation(), f, () => {
    const y = 0.11;
    ctx.beginPath();
    ctx.roundRect(-0.172, y, 0.35, 0.055, 0.012);
    ctx.strokeStyle = INK;
    ctx.lineWidth = LINE * 1.4;
    ctx.stroke();
    ctx.fillStyle = STAN.belt;
    ctx.fill();
    ctx.fillStyle = shade(STAN.pants, -0.05);
    for (const x of [-0.12, 0.03]) ctx.fillRect(x - 0.01, y - 0.004, 0.02, 0.063);
    // Brass buckle.
    ctx.beginPath();
    ctx.roundRect(0.085, y - 0.006, 0.06, 0.067, 0.01);
    ctx.strokeStyle = STAN.brass;
    ctx.lineWidth = 0.014;
    ctx.stroke();
    oval(ctx, 0.095, y + 0.045, 0.008, 0.006, rgba("#ffffff", 0.75));
  });
}

function neck(ctx: Ctx, chest: RigidBody, headB: RigidBody) {
  const c = chest.translation();
  const a = chest.rotation();
  const base = { x: c.x - Math.sin(a) * 0.24, y: c.y + Math.cos(a) * 0.24 };
  const h = headB.translation();
  const top = { x: (base.x + h.x) / 2, y: (base.y + h.y) / 2 };
  const p = () => capsule(ctx, base, top, 0.06, 0.06);
  outline(ctx, p);
  fill(ctx, p, shade(STAN.skin, -0.14));
}

/** The polo shirt: shoulders, collar, placket, a chest pocket with the logo and a pen. */
function shirt(ctx: Ctx, chest: RigidBody, f: number, hem = 0) {
  const s = STAN.shirt;
  const at = chest.translation();
  const ang = chest.rotation();
  const shape = () => {
    ctx.save();
    ctx.translate(at.x, at.y);
    ctx.rotate(ang);
    ctx.scale(f, 1);
    ctx.beginPath();
    ctx.moveTo(-0.17, -0.135);
    ctx.quadraticCurveTo(-0.2, 0.05, -0.19, 0.2);
    ctx.quadraticCurveTo(-0.17, 0.285, -0.08, 0.3);
    ctx.lineTo(0.09, 0.3);
    ctx.quadraticCurveTo(0.19, 0.29, 0.205, 0.19);
    // The hem: it flutters (pulled down by a bounce, trailing when he runs).
    ctx.quadraticCurveTo(0.225, 0.05, 0.195, -0.135);
    ctx.quadraticCurveTo(0.0 - hem * 1.5, -0.16 - hem, -0.17 - Math.max(0, -hem) * 0.4, -0.135 - Math.max(0, -hem) * 0.3);
    ctx.closePath();
    ctx.restore();
  };
  outline(ctx, shape);
  fill(ctx, shape, s);
  cel(
    ctx,
    shape,
    s,
    () => local(ctx, at, ang, f, () => {
      // The back, and under the chest.
      ctx.beginPath();
      ctx.moveTo(-0.25, -0.2);
      ctx.lineTo(-0.25, 0.35);
      ctx.quadraticCurveTo(-0.1, 0.1, -0.1, -0.2);
      ctx.fill();
      ctx.fillRect(-0.25, -0.2, 0.5, 0.075);
    }),
    () => local(ctx, at, ang, f, () => {
      ctx.beginPath();
      ctx.ellipse(0.08, 0.24, 0.1, 0.035, 0, 0, Math.PI * 2);
      ctx.fill();
    }),
  );
  local(ctx, at, ang, f, () => {
    const fold = shade(s, -0.32);
    // Folds where it's tucked in, and under the arm.
    line(ctx, fold, 0.007, [[-0.1, -0.1], [-0.04, -0.075], [0.02, -0.09]]);
    line(ctx, fold, 0.007, [[0.07, -0.11], [0.13, -0.085]]);
    line(ctx, fold, 0.006, [[-0.13, 0.14], [-0.09, 0.07], [-0.1, 0.0]]);
    // Placket and buttons.
    ctx.beginPath();
    ctx.roundRect(0.085, 0.13, 0.042, 0.165, 0.012);
    ctx.fillStyle = shade(s, -0.06);
    ctx.fill();
    line(ctx, fold, 0.005, [[0.085, 0.14], [0.085, 0.29]]);
    for (const y of [0.25, 0.18]) {
      oval(ctx, 0.106, y, 0.012, 0.012, "#f4f1e8");
      oval(ctx, 0.103, y + 0.004, 0.004, 0.004, "#ffffff");
    }
    // Chest pocket with the Odd Jobs logo, and a pen clipped in it.
    ctx.beginPath();
    ctx.roundRect(-0.03, 0.02, 0.1, 0.095, [0, 0, 0.022, 0.022]);
    ctx.strokeStyle = fold;
    ctx.lineWidth = 0.006;
    ctx.stroke();
    line(ctx, "#252a36", 0.013, [[0.045, 0.1], [0.045, 0.15]]);
    oval(ctx, 0.045, 0.152, 0.009, 0.009, "#c94f3d");
    oval(ctx, 0.008, 0.06, 0.024, 0.024, STAN.cap);
    label(ctx, "OJ", 0.008, 0.06, 0.026, "#ffffff", f);
    // Collar: two flaps lying open over the neck.
    for (const [pts, c] of [
      [[[-0.09, 0.305], [0.085, 0.215], [0.05, 0.32]], shade(s, 0.14)],
      [[[0.16, 0.3], [0.1, 0.215], [0.085, 0.32]], shade(s, 0.05)],
    ] as const) {
      ctx.beginPath();
      for (const [x, y] of pts) ctx.lineTo(x, y);
      ctx.closePath();
      ctx.strokeStyle = INK;
      ctx.lineWidth = LINE * 1.2;
      ctx.stroke();
      ctx.fillStyle = c;
      ctx.fill();
    }
  });
}

// ---- head

/** Stanley's head, three-quarter view: hair under the cap, ear, big eyes, a button nose. */
function head(ctx: Ctx, body: RigidBody, f: number, m: Mood, brimFlex = 0, hairSway = 0) {
  const R = DIM.head.r;
  const at = body.translation();
  const a = body.rotation();
  // Gaze in the head's frame (x forward, y up).
  const gx = (m.gaze.x * Math.cos(a) + m.gaze.y * Math.sin(a)) * f;
  const gy = -m.gaze.x * Math.sin(a) + m.gaze.y * Math.cos(a);
  const gl = Math.hypot(gx, gy) || 1;
  const lx = (gx / gl) * 0.013;
  const ly = (gy / gl) * 0.013;
  local(ctx, at, a, f, () => {
    const face = () => {
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
    };
    // A button nose between the eyes, just below them.
    const NX = R * 0.43;
    const NY = -R * 0.3;
    const ear = () => {
      ctx.beginPath();
      ctx.ellipse(-R * 0.5, -R * 0.18, R * 0.15, R * 0.2, 0.2, 0, Math.PI * 2);
    };
    // Hair at the back and side, under the cap.
    const hair = () => {
      // Sways from where it comes out under the cap.
      ctx.save();
      ctx.translate(-R * 0.4, R * 0.35);
      ctx.rotate(hairSway);
      ctx.translate(R * 0.4, -R * 0.35);
      ctx.beginPath();
      ctx.moveTo(-R * 0.1, R * 0.42);
      ctx.quadraticCurveTo(-R * 1.15, R * 0.45, -R * 1.0, -R * 0.38);
      ctx.lineTo(-R * 0.88, -R * 0.2);
      ctx.lineTo(-R * 0.82, -R * 0.45);
      ctx.lineTo(-R * 0.7, -R * 0.15);
      ctx.lineTo(-R * 0.62, -R * 0.02);
      ctx.lineTo(-R * 0.3, R * 0.05);
      ctx.lineTo(-R * 0.27, -R * 0.22);
      ctx.lineTo(-R * 0.18, R * 0.2);
      ctx.closePath();
      ctx.restore();
    };
    for (const p of [face, hair]) outline(ctx, p);
    fill(ctx, face, STAN.skin);
    // Shade: the back of the head, and under the jaw.
    cel(ctx, face, STAN.skin, () => {
      ctx.beginPath();
      ctx.arc(0, 0, R * 1.1, 0, Math.PI * 2);
      ctx.arc(R * 0.16, R * 0.1, R * 1.0, 0, Math.PI * 2, true);
      ctx.fill("evenodd");
    });
    fill(ctx, hair, STAN.hair);
    line(ctx, shade(STAN.hair, -0.3), 0.006, [[-R * 0.8, R * 0.2], [-R * 0.9, -R * 0.2]]);
    line(ctx, shade(STAN.hair, -0.3), 0.006, [[-R * 0.55, R * 0.25], [-R * 0.62, R * 0.02]]);
    outline(ctx, ear, LINE * 0.7);
    fill(ctx, ear, shade(STAN.skin, -0.05));
    line(ctx, shade(STAN.skin, -0.35), 0.007, [[-R * 0.46, R * -0.04], [-R * 0.56, -R * 0.12], [-R * 0.54, -R * 0.26], [-R * 0.45, -R * 0.29]]);
    // Cheeks either side of the nose.
    oval(ctx, R * 0.1, -R * 0.42, R * 0.19, R * 0.11, rgba("#ff7f6e", 0.3));
    oval(ctx, R * 0.78, -R * 0.4, R * 0.12, R * 0.09, rgba("#ff7f6e", 0.22));
    // The nose: a soft shadow under it, its shape, a line round the underside, a shine on top.
    oval(ctx, NX + R * 0.02, NY - R * 0.1, R * 0.13, R * 0.05, rgba("#b06a44", 0.35));
    oval(ctx, NX, NY, R * 0.14, R * 0.12, shade(STAN.skin, 0.04));
    ctx.beginPath();
    ctx.ellipse(NX, NY, R * 0.14, R * 0.12, 0, Math.PI * 1.05, Math.PI * 1.95);
    ctx.strokeStyle = shade(STAN.skin, -0.42);
    ctx.lineWidth = 0.008;
    ctx.stroke();
    oval(ctx, NX + R * 0.03, NY + R * 0.04, R * 0.05, R * 0.035, rgba("#ffffff", 0.55));

    // Eyes (the far one a little smaller and narrower).
    for (const [ex, k] of [
      [R * 0.12, 1],
      [R * 0.72, 0.78],
    ] as const) {
      const ey = -R * 0.08;
      if (m.down) {
        line(ctx, INK, 0.016, [[ex - 0.024, ey - 0.024], [ex + 0.024, ey + 0.024]]);
        line(ctx, INK, 0.016, [[ex + 0.024, ey - 0.024], [ex - 0.024, ey + 0.024]]);
        continue;
      }
      const rx = 0.036 * k;
      const ry = m.blink ? 0.006 : 0.046;
      ctx.beginPath();
      ctx.ellipse(ex, ey, rx, ry, 0, 0, Math.PI * 2);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.01;
      ctx.stroke();
      oval(ctx, ex, ey, rx, ry, "#fffdf8");
      if (!m.blink) {
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(ex, ey, rx, ry, 0, 0, Math.PI * 2);
        ctx.clip();
        const ix = ex + lx * k;
        const iy = ey + ly;
        oval(ctx, ix, iy, 0.025 * k, 0.027, STAN.iris);
        oval(ctx, ix, iy, 0.014 * k, 0.015, "#140d0a");
        oval(ctx, ix - 0.008, iy + 0.01, 0.0075, 0.0075, "#ffffff");
        oval(ctx, ix + 0.007, iy - 0.009, 0.0035, 0.0035, rgba("#ffffff", 0.8));
        ctx.restore();
      }
      // Brows: worried in the air or on the floor, set hard when lifting.
      const by = ey + 0.072 + (m.air ? 0.014 : 0) - (m.strain ? 0.012 : 0);
      const tilt = m.strain ? -0.018 : m.air ? 0.016 : 0.004;
      const inner = k < 1 ? -1 : 1; // the inner end of each brow is towards the other eye
      line(ctx, shade(STAN.hair, -0.25), 0.017, [
        [ex - rx * 1.05, by - inner * tilt],
        [ex, by + 0.006],
        [ex + rx * 1.05, by + inner * tilt],
      ]);
    }

    // Mouth.
    const mx = R * 0.42;
    const my = -R * 0.62;
    if (m.down || m.air) {
      ctx.beginPath();
      ctx.ellipse(mx, my, 0.027, 0.036, 0, 0, Math.PI * 2);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.008;
      ctx.stroke();
      ctx.fillStyle = "#5a2026";
      ctx.fill();
      oval(ctx, mx, my - 0.018, 0.016, 0.01, "#e0707a");
    } else if (m.strain) {
      ctx.beginPath();
      ctx.roundRect(mx - 0.042, my - 0.018, 0.084, 0.036, 0.014);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.009;
      ctx.stroke();
      ctx.fillStyle = "#fffdf8";
      ctx.fill();
      line(ctx, rgba(INK, 0.5), 0.004, [[mx - 0.04, my], [mx + 0.04, my]]);
      for (const x of [-0.014, 0.014]) line(ctx, rgba(INK, 0.4), 0.004, [[mx + x, my - 0.016], [mx + x, my + 0.016]]);
    } else {
      // A small, slightly lopsided smile.
      ctx.beginPath();
      ctx.moveTo(mx - 0.045, my + 0.016);
      ctx.quadraticCurveTo(mx - 0.005, my - 0.038, mx + 0.05, my + 0.022);
      ctx.quadraticCurveTo(mx, my - 0.012, mx - 0.045, my + 0.016);
      ctx.fillStyle = "#6d2a2e";
      ctx.fill();
      line(ctx, INK, 0.008, [[mx - 0.045, my + 0.016], [mx - 0.005, my - 0.012], [mx + 0.05, my + 0.022]]);
    }

    // The cap: crown with panel seams and a button, the OJ patch, a sweatband, the brim forward.
    const cy = R * 0.36;
    const crown = () => {
      ctx.beginPath();
      ctx.moveTo(-R * 1.04, cy);
      ctx.bezierCurveTo(-R * 1.08, R * 1.42, R * 1.08, R * 1.42, R * 1.04, cy);
      ctx.closePath();
    };
    // The bill comes out from under the front of the crown, level with its rim, curving down a touch at the tip.
    const flex = (fn: () => void) => {
      ctx.save();
      ctx.translate(R * 0.75, cy);
      ctx.rotate(brimFlex);
      ctx.translate(-R * 0.75, -cy);
      fn();
      ctx.restore();
    };
    const brim = () => flex(() => {
      ctx.beginPath();
      ctx.moveTo(R * 0.55, cy + 0.035);
      ctx.quadraticCurveTo(R * 1.25, cy + 0.04, R * 1.66, cy + 0.012);
      ctx.quadraticCurveTo(R * 1.72, cy - 0.006, R * 1.62, cy - 0.012);
      ctx.quadraticCurveTo(R * 1.2, cy - 0.004, R * 0.55, cy - 0.006);
      ctx.closePath();
    });
    for (const p of [crown, brim]) outline(ctx, p);
    fill(ctx, brim, shade(STAN.cap, -0.06));
    flex(() => {
      line(ctx, shade(STAN.cap, -0.42), 0.008, [[R * 0.95, cy - 0.002], [R * 1.3, cy - 0.004], [R * 1.6, cy - 0.008]]);
      line(ctx, rgba("#ffffff", 0.35), 0.005, [[R * 1.05, cy + 0.028], [R * 1.4, cy + 0.026], [R * 1.6, cy + 0.012]]);
    });
    fill(ctx, crown, STAN.cap);
    cel(
      ctx,
      crown,
      STAN.cap,
      () => {
        ctx.beginPath();
        ctx.ellipse(-R * 0.95, cy, R * 0.75, R * 1.25, 0, 0, Math.PI * 2);
        ctx.fill();
      },
      () => {
        ctx.beginPath();
        ctx.ellipse(R * 0.25, R * 1.05, R * 0.45, R * 0.13, -0.15, 0, Math.PI * 2);
        ctx.fill();
      },
    );
    for (const x of [-0.5, 0.2]) line(ctx, shade(STAN.cap, -0.3), 0.006, [[x * R, cy + 0.01], [x * R * 0.6, R * 0.85], [0, R * 1.2]]);
    oval(ctx, 0, R * 1.2, R * 0.12, R * 0.055, shade(STAN.cap, -0.2));
    ctx.fillStyle = shade(STAN.cap, -0.35);
    ctx.fillRect(-R * 1.03, cy - 0.004, R * 2.06, 0.018);
    ctx.beginPath();
    ctx.ellipse(R * 0.46, R * 0.66, R * 0.18, R * 0.17, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#fff6ea";
    ctx.fill();
    label(ctx, "OJ", R * 0.46, R * 0.66, 0.03, STAN.cap, f);
  });
}

// ----------------------------------------------------------- coworkers ---

interface Coworker {
  hair: "bob" | "fade";
  glasses?: boolean;
  earrings?: boolean;
  beard?: boolean;
  pencil?: boolean;
  iris: string;
  /** So they don't all blink together. */
  phase: number;
}

const COWORKERS: Coworker[] = [
  { hair: "bob", glasses: true, earrings: true, iris: "#3f6f8f", phase: 0 },
  { hair: "fade", beard: true, pencil: true, iris: "#3a2418", phase: 1.7 },
];

/**
 * A coworker's head, face on (as over a cubicle wall), eyes on `look`. `who`
 * picks the person: their hair, glasses, the pencil behind the ear.
 */
export function drawCoworkerHeadHD(r: Renderer, x: number, faceY: number, skin: string, hair: string, look: Vec, who = 0) {
  const p = COWORKERS[who % COWORKERS.length];
  const c = { x, y: faceY - 0.02 };
  const R = 0.155;
  const t = r.clock + p.phase;
  const blink = t % 3.7 < 0.12;
  const hairDark = shade(hair, -0.3);
  world(r, (ctx) => {
    local(ctx, c, 0, 1, () => {
      const face = () => {
        ctx.beginPath();
        ctx.ellipse(0, 0, R * 0.95, R * 1.04, 0, 0, Math.PI * 2);
      };
      const ears = () => {
        ctx.beginPath();
        for (const s of [-1, 1]) {
          ctx.moveTo(s * R * 0.98 + R * 0.15, -R * 0.08);
          ctx.ellipse(s * R * 0.98, -R * 0.08, R * 0.15, R * 0.21, 0, 0, Math.PI * 2);
        }
      };
      const back = () => {
        ctx.beginPath();
        if (p.hair === "bob") {
          ctx.moveTo(-R * 1.2, -R * 0.6);
          ctx.bezierCurveTo(-R * 1.5, R * 1.55, R * 1.5, R * 1.55, R * 1.2, -R * 0.6);
          ctx.quadraticCurveTo(R * 1.0, -R * 0.72, R * 0.85, -R * 0.55);
          ctx.lineTo(-R * 0.85, -R * 0.55);
          ctx.quadraticCurveTo(-R * 1.0, -R * 0.72, -R * 1.2, -R * 0.6);
        } else {
          ctx.moveTo(-R * 0.97, R * 0.1);
          ctx.lineTo(-R * 1.0, R * 0.78);
          ctx.quadraticCurveTo(-R * 0.92, R * 1.3, 0, R * 1.32);
          ctx.quadraticCurveTo(R * 0.92, R * 1.3, R * 1.0, R * 0.78);
          ctx.lineTo(R * 0.97, R * 0.1);
        }
        ctx.closePath();
      };
      if (p.pencil) {
        local(ctx, { x: R * 0.98, y: R * 0.16 }, 0.55, 1, () => {
          ctx.beginPath();
          ctx.rect(-0.12, -0.01, 0.16, 0.02);
          ctx.strokeStyle = INK;
          ctx.lineWidth = 0.012;
          ctx.stroke();
          ctx.fillStyle = "#f2c230";
          ctx.fill();
          ctx.fillStyle = "#e88a9a";
          ctx.fillRect(-0.135, -0.01, 0.02, 0.02);
          ctx.beginPath();
          ctx.moveTo(0.04, -0.01);
          ctx.lineTo(0.068, 0);
          ctx.lineTo(0.04, 0.01);
          ctx.fillStyle = "#e8c9a0";
          ctx.fill();
        });
      }
      for (const q of [back, ears, face]) outline(ctx, q);
      fill(ctx, back, hair);
      fill(ctx, ears, shade(skin, -0.06));
      fill(ctx, face, skin);
      cel(ctx, face, skin, () => {
        ctx.beginPath();
        ctx.ellipse(R * 0.14, R * 0.08, R * 0.95, R * 1.08, 0, 0, Math.PI * 2);
        ctx.rect(-R * 2, -R * 2, R * 4, R * 4);
        ctx.fill("evenodd");
      });
      if (p.earrings) for (const s of [-1, 1]) oval(ctx, s * R * 1.0, -R * 0.33, 0.013, 0.013, "#e2b13c");

      // Front hair.
      if (p.hair === "bob") {
        const fringe = () => {
          ctx.beginPath();
          ctx.moveTo(-R * 1.0, R * 0.05);
          ctx.bezierCurveTo(-R * 1.02, R * 1.3, R * 1.02, R * 1.3, R * 1.0, R * 0.05);
          ctx.lineTo(R * 0.86, R * 0.44);
          ctx.quadraticCurveTo(0, R * 0.3, -R * 0.86, R * 0.44);
          ctx.closePath();
        };
        outline(ctx, fringe, LINE * 0.8);
        fill(ctx, fringe, hair);
        for (let i = -3; i <= 3; i++) line(ctx, hairDark, 0.006, [[i * R * 0.24, R * 0.42], [i * R * 0.21, R * 0.86]]);
        line(ctx, rgba("#ffffff", 0.35), 0.014, [[-R * 0.55, R * 0.88], [-R * 0.1, R * 1.0]]);
      } else {
        // Short, flat on top, a crisp hairline; tight curls.
        const top = () => {
          ctx.beginPath();
          ctx.moveTo(-R * 0.97, R * 0.25);
          ctx.lineTo(-R * 1.0, R * 0.78);
          ctx.quadraticCurveTo(-R * 0.92, R * 1.3, 0, R * 1.32);
          ctx.quadraticCurveTo(R * 0.92, R * 1.3, R * 1.0, R * 0.78);
          ctx.lineTo(R * 0.97, R * 0.25);
          ctx.lineTo(R * 0.8, R * 0.42);
          ctx.quadraticCurveTo(0, R * 0.6, -R * 0.8, R * 0.42);
          ctx.closePath();
        };
        fill(ctx, top, hair);
        ctx.save();
        top();
        ctx.clip();
        for (let i = 0; i < 40; i++) {
          const u = ((i * 7919) % 100) / 100;
          const v = ((i * 104729) % 100) / 100;
          oval(ctx, (u - 0.5) * R * 1.9, R * (0.45 + v * 0.85), 0.009, 0.009, rgba("#ffffff", 0.12));
        }
        ctx.restore();
        line(ctx, rgba(INK, 0.6), 0.006, [[-R * 0.8, R * 0.42], [0, R * 0.6], [R * 0.8, R * 0.42]]);
      }
      // Eyes, following Stanley about.
      for (const s of [-1, 1]) {
        const ex = s * R * 0.37;
        const ey = R * 0.14;
        const d = { x: look.x - (x + ex), y: look.y - (c.y + ey) };
        const dl = Math.hypot(d.x, d.y) || 1;
        const ox = (d.x / dl) * 0.012;
        const oy = (d.y / dl) * 0.01;
        const rx = 0.034;
        const ry = blink ? 0.005 : 0.038;
        ctx.beginPath();
        ctx.ellipse(ex, ey, rx, ry, 0, 0, Math.PI * 2);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 0.009;
        ctx.stroke();
        oval(ctx, ex, ey, rx, ry, "#fffdf8");
        if (!blink) {
          ctx.save();
          ctx.beginPath();
          ctx.ellipse(ex, ey, rx, ry, 0, 0, Math.PI * 2);
          ctx.clip();
          oval(ctx, ex + ox, ey + oy, 0.022, 0.024, p.iris);
          oval(ctx, ex + ox, ey + oy, 0.012, 0.013, "#120c0a");
          oval(ctx, ex + ox - 0.007, ey + oy + 0.009, 0.006, 0.006, "#ffffff");
          ctx.restore();
        }
        if (p.earrings) line(ctx, INK, 0.006, [[ex + s * rx * 0.8, ey + ry * 0.6], [ex + s * (rx + 0.014), ey + ry * 0.95]]);
        // Brows, raised: they've seen this before (under a fringe, you can't see them).
        if (p.hair === "bob") continue;
        const lift = 0.007 * Math.sin(r.clock * 1.3 + p.phase);
        line(ctx, shade(hair, 0.1), 0.018, [
          [ex - s * rx * 1.1, ey + 0.058 + lift],
          [ex + s * rx * 0.1, ey + 0.071 + lift],
          [ex + s * rx * 1.15, ey + 0.062 + lift],
        ]);
      }
      // Nose and cheeks.
      line(ctx, rgba(shade(skin, -0.45), 0.5), 0.007, [[R * 0.06, -R * 0.12], [R * 0.1, -R * 0.26], [R * 0.0, -R * 0.3]]);
      for (const s of [-1, 1]) oval(ctx, s * R * 0.56, -R * 0.28, R * 0.16, R * 0.1, rgba("#ff7a6a", p.hair === "bob" ? 0.28 : 0.14));
      if (p.beard) {
        const beard = () => {
          ctx.beginPath();
          ctx.moveTo(-R * 0.93, -R * 0.12);
          ctx.quadraticCurveTo(-R * 0.85, -R * 1.2, 0, -R * 1.16);
          ctx.quadraticCurveTo(R * 0.85, -R * 1.2, R * 0.93, -R * 0.12);
          ctx.lineTo(R * 0.8, -R * 0.2);
          ctx.quadraticCurveTo(R * 0.7, -R * 0.75, 0, -R * 0.8);
          ctx.quadraticCurveTo(-R * 0.7, -R * 0.75, -R * 0.8, -R * 0.2);
          ctx.closePath();
        };
        fill(ctx, beard, hair);
      }
      // Glasses: cat-eye frames, a glint on each lens.
      if (p.glasses) {
        for (const s of [-1, 1]) {
          const ex = s * R * 0.37;
          const ey = R * 0.14;
          ctx.beginPath();
          ctx.moveTo(ex - s * 0.055, ey + 0.035);
          ctx.quadraticCurveTo(ex, ey + 0.052, ex + s * 0.068, ey + 0.055);
          ctx.quadraticCurveTo(ex + s * 0.062, ey - 0.048, ex, ey - 0.048);
          ctx.quadraticCurveTo(ex - s * 0.057, ey - 0.048, ex - s * 0.055, ey + 0.035);
          ctx.closePath();
          ctx.fillStyle = "rgba(170,210,255,0.16)";
          ctx.fill();
          ctx.strokeStyle = INK;
          ctx.lineWidth = 0.013;
          ctx.stroke();
          line(ctx, rgba("#ffffff", 0.6), 0.007, [[ex - 0.032, ey + 0.022], [ex - 0.012, ey + 0.038]]);
        }
        line(ctx, INK, 0.011, [[-R * 0.12, R * 0.2], [R * 0.12, R * 0.2]]);
      }
    });
  });
}

/** A coworker's fingers curled over the top of the cubicle wall. */
export function drawCoworkerHandsHD(r: Renderer, x: number, wallTop: number, skin: string) {
  world(r, (ctx) => {
    for (const s of [-1, 1]) {
      local(ctx, { x: x + s * 0.2, y: wallTop }, 0, 1, () => {
        const fingers = () => {
          ctx.beginPath();
          for (let i = 0; i < 4; i++) {
            const fx = s * (i - 1.5) * 0.026;
            const h = 0.038 + (i === 1 || i === 2 ? 0.008 : 0);
            ctx.roundRect(fx - 0.012, -0.004, 0.024, h, 0.012);
          }
        };
        outline(ctx, fingers, LINE * 0.6);
        fill(ctx, fingers, skin);
        for (let i = 0; i < 4; i++) {
          const fx = s * (i - 1.5) * 0.026;
          const h = 0.038 + (i === 1 || i === 2 ? 0.008 : 0);
          oval(ctx, fx, h - 0.017, 0.006, 0.007, rgba("#ffffff", 0.5));
        }
      });
    }
  });
}
