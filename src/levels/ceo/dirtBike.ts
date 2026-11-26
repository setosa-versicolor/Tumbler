import type { Collider, RevoluteImpulseJoint, RigidBody } from "@dimforge/rapier2d-deterministic-compat";
import { OUTDOOR, type Level, type LevelInstance } from "../level";
import type { Kit } from "../kit";
import type { Game, GameEvent } from "../../sim/game";
import type { Renderer } from "../../render/renderer";
import { RAPIER } from "../../physics/world";
import { G_FLOOR, G_PROP, G_WORLD, groups } from "../../physics/groups";
import { wrapAngle, type Vec } from "../../sim/math";

// CEO Life: the dirt bike. Hold the handlebars to give it gas (D), brake with
// A; in the air, A/D tip it back and forward, for flips. Stanley sits on it,
// but nothing holds him there but the seat: land badly and off he comes.

const W = 90;
/** The bike (and its wheels) don't collide with Stanley: he rides on the seat, his legs hang either side. */
const BIKE_GROUPS = groups(G_PROP, G_WORLD | G_FLOOR | G_PROP);
const WHEEL_R = 0.32;
/** Wheel hubs and the bits Stanley holds, in the bike's frame (x forward, y up). */
const REAR = { x: -0.62, y: -0.22 };
const FRONT = { x: 0.66, y: -0.22 };
export const SEAT = { x: -0.16, y: 0.36 };
export const BARS = { x: 0.36, y: 0.6 };
/** Top speed (m/s) on the gas, and how hard it pulls (m/s²) and brakes. */
const TOP_SPEED = 13;
const PULL = 10;
const BRAKE = 9;
/** How hard A/D tip the bike in the air (N·m). */
const AIR_TORQUE = 650;
/** Ride past here and you're carried back round to the start, for another lap. */
const LAP_AT = 84;
const LAP_TO = 6;
/** The seat holds Stanley like a soft spring; thrown further than this from it, he's off. */
const SEAT_BREAK = 0.62;

/** The track: [x, height] along the top of the dirt, ramps and all. */
export const TRACK: [number, number][] = [
  [-1, 0],
  [10, 0],
  // A tabletop: up, across, down. Forgiving.
  [13.5, 0.9],
  [16.5, 0.9],
  [19.5, 0],
  // Whoops.
  [23, 0],
  [24, 0.25],
  [25, 0],
  [26, 0],
  [27, 0.25],
  [28, 0],
  [33, 0],
  // The big one: a kicker, a gap and a long landing. Come up short and you're in the dip, and ride out up its far side.
  [40, 1.8],
  [40.1, 0],
  [43.5, 0],
  [46.5, 1.6],
  [52.5, 0],
  [W + 1, 0],
];

/** Hard ground under the track: each straight stretch of dirt is a thin rotated box. */
function buildTrack(kit: Kit) {
  for (let i = 0; i < TRACK.length - 1; i++) {
    const [x0, y0] = TRACK[i];
    const [x1, y1] = TRACK[i + 1];
    if (y0 === 0 && y1 === 0) continue;
    const len = Math.hypot(x1 - x0, y1 - y0);
    const a = Math.atan2(y1 - y0, x1 - x0);
    const hh = 0.12;
    // The box's top edge runs along the slope.
    const mx = (x0 + x1) / 2 + Math.sin(a) * hh;
    const my = (y0 + y1) / 2 - Math.cos(a) * hh;
    kit.solid(mx, my, len / 2, hh, "ground", { angle: a, hidden: true, friction: 1.2 });
    // Fill under a ramp so it's solid, not a plank.
    // (A flat top is a box too; under a ramp, fill it in so it's solid, not a plank.)
    const top = Math.max(y0, y1);
    if (top > 0.2 && y0 !== y1) {
      const xh = y1 > y0 ? x1 : x0;
      kit.solid(xh, top / 2, 0.05, top / 2, "ground", { hidden: true });
    }
    if (y0 === y1 && y0 > 0) kit.solid((x0 + x1) / 2, y0 / 2, (x1 - x0) / 2, y0 / 2, "ground", { hidden: true });
  }
}

/** Height of the dirt at x. */
export function trackY(x: number): number {
  for (let i = 0; i < TRACK.length - 1; i++) {
    const [x0, y0] = TRACK[i];
    const [x1, y1] = TRACK[i + 1];
    if (x >= x0 && x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1);
  }
  return 0;
}

export interface Bike {
  chassis: RigidBody;
  rear: RigidBody;
  front: RigidBody;
  bars: RigidBody;
  motor: RevoluteImpulseJoint;
}

function buildBike(kit: Kit, x: number): Bike {
  const world = kit.world;
  const y = WHEEL_R - REAR.y + 0.02;
  const chassis = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y).setCcdEnabled(true).setAngularDamping(0.4));
  // A hand on the bike takes the handlebars, not the frame or a wheel.
  chassis.userData = { noGrab: true };
  // Frame and engine, and the tank and seat on top.
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 0.12).setDensity(260).setFriction(0.6).setCollisionGroups(BIKE_GROUPS), chassis);
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.32, 0.07).setTranslation(-0.02, 0.18).setDensity(40).setCollisionGroups(BIKE_GROUPS), chassis);
  const wheel = (at: Vec) => {
    const w = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x + at.x, y + at.y).setCcdEnabled(true).setAngularDamping(0.05));
    w.userData = { noGrab: true };
    world.createCollider(RAPIER.ColliderDesc.ball(WHEEL_R).setDensity(40).setFriction(1.6).setRestitution(0.15).setCollisionGroups(BIKE_GROUPS), w);
    const j = world.createImpulseJoint(RAPIER.JointData.revolute(at, { x: 0, y: 0 }), chassis, w, true) as RevoluteImpulseJoint;
    j.setContactsEnabled(false);
    return { w, j };
  };
  const rear = wheel(REAR);
  const front = wheel(FRONT);
  // The handlebars: a little body of their own, fixed on, so a hand reaching for them gets them (not the frame).
  const bars = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x + BARS.x, y + BARS.y));
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.05, 0.05).setDensity(20).setCollisionGroups(BIKE_GROUPS), bars);
  const fj = world.createImpulseJoint(RAPIER.JointData.fixed(BARS, 0, { x: 0, y: 0 }, 0), chassis, bars, true);
  fj.setContactsEnabled(false);
  return { chassis, rear: rear.w, front: front.w, bars, motor: rear.j };
}

/** A point in the bike's frame, in the world. */
function onBike(b: RigidBody, p: Vec): Vec {
  const c = b.translation();
  const a = b.rotation();
  return { x: c.x + p.x * Math.cos(a) - p.y * Math.sin(a), y: c.y + p.x * Math.sin(a) + p.y * Math.cos(a) };
}

/** Is this body touching any fixed ground? */
function onGround(game: Game, b: RigidBody): boolean {
  let touching = false;
  const col: Collider = b.collider(0);
  game.world.contactPairsWith(col, (other) => {
    if (touching || other.parent()?.isDynamic()) return;
    game.world.contactPair(col, other, (m) => {
      if (m.numContacts() > 0) touching = true;
    });
  });
  return touching;
}

export const dirtBike: Level = {
  id: "ceo-dirt-bike",
  title: "Dirt Bike",
  goal: "Your own track. Grab the handlebars and give it some gas.",
  hint: "Hold grab on the handlebars to ride · D gas · A brake · In the air: A/D to flip",
  icon: "🏍️",
  par: [0, 0],
  sandbox: true,
  ceo: true,
  bounds: { w: W, h: 6 },
  viewHeight: 6.5,
  spawn: { x: 2.2, y: 0 },
  theme: { ...OUTDOOR, top: "#79b8e8", bottom: "#f3dcae", floor: "#8a6a4a", floorTop: "#a5825f" },
  build(kit) {
    kit.enclosure(W, 6, true);
    buildTrack(kit);
    const bike = buildBike(kit, 4.2);
    let flip = 0;
    let air = 0;
    let wasAir = false;
    let best = 0;
    let crashCooldown = 0;
    /** Seconds the bike's been upside down. */
    let over = 0;
    /** In the air, A/D lean the bike, but not a key that was already held at take-off (holding the gas off a jump shouldn't nose-dive you): let go and press again. */
    let leanArmed = true;
    let laps = 0;
    /** Seconds on the ground since the last time in the air. */
    let ground = 1;

    const holdingBars = (game: Game) => game.stanley.grips.L.held === bike.bars || game.stanley.grips.R.held === bike.bars;

    const inst: LevelInstance & { bike: Bike } = {
      bike,
      update(game, dt): GameEvent[] {
        const ev: GameEvent[] = [];
        const st = game.stanley;
        const ch = bike.chassis;
        const seat = onBike(ch, SEAT);
        const p = st.rig.pelvis.translation();
        const err = { x: seat.x - p.x, y: seat.y - p.y };
        const dist = Math.hypot(err.x, err.y);
        const holding = holdingBars(game);
        crashCooldown = Math.max(0, crashCooldown - dt);

        // On: hands on the bars and close enough, he's pulled onto the seat.
        if (!st.seated && holding && dist < 0.9 && crashCooldown === 0 && st.balance.posture === "up") st.seated = true;
        // Off: thrown clear of the seat, or a head-first landing (hard, or with the bike well over).
        const hv = st.rig.head.linvel();
        const cvel = ch.linvel();
        const faceplant = Math.hypot(hv.x - cvel.x, hv.y - cvel.y) > 2.5 || Math.abs(wrapAngle(ch.rotation())) > 0.8;
        const headDown = st.seated && faceplant && onGround(game, st.rig.head);
        if (st.seated && (dist > SEAT_BREAK || headDown)) {
          st.seated = false;
          crashCooldown = 1.2;
          st.balance.knockDown(1.0);
          ev.push({ type: "ouch", text: ["BAIL!", "WIPEOUT!", "OOF!", "OFF HE COMES!"][Math.floor(game.rand() * 4)], pos: { x: p.x, y: p.y + 1.2 } });
        }

        if (st.seated) {
          st.face(1);
          st.seatAngle = ch.rotation();
          // The seat: a soft spring between his hips and it, felt by both him and the bike.
          const M = st.rig.totalMass;
          const pv = st.rig.pelvis.linvel();
          const cv = ch.linvel();
          const w = 20;
          const jx = M * (w * w * err.x + 2 * w * (cv.x - pv.x)) * dt;
          const jy = M * (w * w * err.y + 2 * w * (cv.y - pv.y)) * dt;
          st.rig.pelvis.applyImpulse({ x: jx, y: jy }, true);
          ch.applyImpulseAtPoint({ x: -jx * 0.6, y: -jy * 0.6 }, seat, true);
        }

        // In the air: lean back and forward, for flips. Count the turns.
        const rearDown = onGround(game, bike.rear);
        const airborne = !rearDown && !onGround(game, bike.front);
        // The motor: on the gas (D) only with a hand on the bars, and a wheel on the ground. It drives the bike
        // along the way it's pointing (bike and rider both), and the wheels roll; A brakes.
        const move = game.intent.move;
        const gas = holding && st.seated && !airborne;
        const a = ch.rotation();
        const dir = { x: Math.cos(a), y: Math.sin(a) };
        const cvel0 = ch.linvel();
        const along = cvel0.x * dir.x + cvel0.y * dir.y;
        const mass = ch.mass() + bike.rear.mass() + bike.front.mass() + st.rig.totalMass;
        let acc = 0;
        if (gas && move > 0.1) acc = Math.min(PULL, Math.max(0, 5 * (TOP_SPEED * move - along)));
        else if (gas && move < -0.1) acc = -Math.min(BRAKE, Math.max(0, along * 6));
        if (acc) ch.applyImpulse({ x: dir.x * mass * acc * dt, y: dir.y * mass * acc * dt }, true);
        bike.motor.configureMotorVelocity(0, 0);
        // On the ground, a wheelie's fine but it won't loop over backwards under power.
        const pitch = wrapAngle(ch.rotation() - Math.atan2(trackY(ch.translation().x + 0.6) - trackY(ch.translation().x - 0.6), 1.2));
        if (rearDown && !airborne && pitch > 0.5) ch.applyTorqueImpulse(-(pitch - 0.5) * 900 * dt - ch.angvel() * 40 * dt, true);
        // Upside down for a moment: that's a crash.
        over = Math.abs(wrapAngle(ch.rotation())) > 2.0 ? over + dt : 0;
        if (st.seated && over > 0.5) {
          st.seated = false;
          crashCooldown = 1.2;
          st.balance.knockDown(1.0);
          ev.push({ type: "ouch", text: "WIPEOUT!", pos: { x: p.x, y: p.y + 1.2 } });
        }
        if (airborne) {
          if (!wasAir) leanArmed = Math.abs(move) < 0.1;
          if (Math.abs(move) < 0.1) leanArmed = true;
          air += dt;
          flip += ch.angvel() * dt;
          const lean = leanArmed ? move : 0;
          if (st.seated && Math.abs(lean) > 0.1) ch.applyTorqueImpulse(-lean * AIR_TORQUE * dt, true);
          // No lean: it settles itself level, gently (flips take a deliberate lean).
          else ch.applyTorqueImpulse((-wrapAngle(ch.rotation()) * 70 - ch.angvel() * 18) * dt, true);
        }
        // Landed (on the ground a moment: a wheel brushing something mid-flip doesn't count): call the trick.
        ground = airborne ? 0 : ground + dt;
        if (ground > 0.12 && air > 0) {
          const turns = Math.round(Math.abs(flip) / (Math.PI * 2));
          const upright = Math.abs(wrapAngle(ch.rotation())) < 0.9;
          const at = { x: ch.translation().x, y: ch.translation().y + 1.8 };
          if (turns >= 1 && upright && st.seated) {
            const name = flip > 0 ? "BACKFLIP" : "FRONTFLIP";
            const n = turns === 1 ? "" : turns === 2 ? "DOUBLE " : turns === 3 ? "TRIPLE " : `${turns}× `;
            ev.push({ type: "score", text: `${n}${name}!`, pos: at });
          } else if (air > 0.9 && upright && st.seated) {
            ev.push({ type: "score", text: `BIG AIR! ${air.toFixed(1)}s`, pos: at });
          }
          if (air > best && st.seated) best = air;
          flip = 0;
          air = 0;
        }
        if (!airborne) flip += ch.angvel() * dt * (air > 0 ? 1 : 0);
        wasAir = airborne;

        // Past the finish: round again. Bike and rider are carried back to the start, still going.
        if (ch.translation().x > LAP_AT) {
          laps++;
          const dx = LAP_TO - ch.translation().x;
          const bodies = [bike.chassis, bike.rear, bike.front, bike.bars, ...(st.seated ? st.rig.bodies : [])];
          for (const b of bodies) {
            const q = b.translation();
            b.setTranslation({ x: q.x + dx, y: q.y }, true);
          }
          ev.push({ type: "score", text: laps === 1 ? "LAP!" : `LAP ${laps}!`, pos: { x: LAP_TO + 1, y: 2.4 } });
        }
        return ev;
      },
      progress: (game) => {
        const speed = Math.abs(bike.chassis.linvel().x);
        const bits = [`${(speed * 3.6).toFixed(0)} km/h`];
        if (best > 0.5) bits.push(`best air ${best.toFixed(1)}s`);
        if (laps) bits.push(`${laps} lap${laps > 1 ? "s" : ""}`);
        return { done: false, label: game.stanley.seated ? bits.join(" · ") : "Grab the handlebars to get on" };
      },
      drawBack(r) {
        drawScenery(r);
      },
      drawMid(r, game) {
        drawTrack(r);
        drawBike(r, bike, game);
      },
    };
    return inst;
  },
};

// ---------------------------------------------------------------- art ---

function drawScenery(r: Renderer) {
  // Far hills, then a line of trees, then the CEO's start banner and the finish.
  for (let i = 0; i < 18; i++) r.circle({ x: i * 6 - 2, y: -2.2 }, 4.2, i % 2 ? "#9cc98a" : "#a9d396");
  for (let x = 1; x < W; x += 2.7) {
    const h = 1.3 + ((x * 37) % 7) * 0.12;
    r.rect(x - 0.06, 0, x + 0.06, h * 0.5, "#6b4a35");
    r.circle({ x, y: h * 0.75 }, 0.5, "#4f8f4a");
    r.circle({ x: x + 0.3, y: h * 0.62 }, 0.38, "#5d9d55");
  }
  const banner = (x: number, text: string) => {
    r.rect(x - 1.6, 0, x - 1.5, 3.4, "#5f6670");
    r.rect(x + 1.5, 0, x + 1.6, 3.4, "#5f6670");
    r.rect(x - 1.6, 2.9, x + 1.6, 3.5, "#2a2230");
    r.text(text, { x, y: 3.2 }, 0.26, "#ffd84a");
  };
  banner(2.5, "CEO TRAIL");
  banner(LAP_AT - 3, "FINISH");
  for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) r.rect(LAP_AT - 4.6 + i * 0.4, 3.5 + j * 0.2, LAP_AT - 4.4 + i * 0.4, 3.7 + j * 0.2, (i + j) % 2 ? "#fff" : "#2a2230");
}

function drawTrack(r: Renderer) {
  // The dirt, as one shape, with a darker band along the top.
  const pts: Vec[] = TRACK.map(([x, y]) => ({ x, y }));
  r.poly([...pts, { x: W + 1, y: -0.4 }, { x: -1, y: -0.4 }], "#9a7350");
  for (let i = 0; i < TRACK.length - 1; i++) {
    const [x0, y0] = TRACK[i];
    const [x1, y1] = TRACK[i + 1];
    r.line({ x: x0, y: y0 - 0.02 }, { x: x1, y: y1 - 0.02 }, 0.05, "#7a5638");
  }
}

function drawBike(r: Renderer, bike: Bike, game: Game) {
  const ctx = r.ctx;
  const ch = bike.chassis;
  const at = (p: Vec) => onBike(ch, p);
  // Wheels: tyre, rim, spokes turning with the wheel.
  for (const w of [bike.rear, bike.front]) {
    const c = w.translation();
    r.circle(c, WHEEL_R, "#1d1d22");
    r.circle(c, WHEEL_R * 0.72, "#3a3d44");
    r.circle(c, WHEEL_R * 0.64, "#c9ccd1");
    r.circle(c, WHEEL_R * 0.56, "#2a2d33");
    for (let k = 0; k < 6; k++) {
      const a = w.rotation() + (k / 6) * Math.PI * 2;
      r.line(c, { x: c.x + Math.cos(a) * WHEEL_R * 0.58, y: c.y + Math.sin(a) * WHEEL_R * 0.58 }, 0.012, "#c9ccd1");
    }
    r.circle(c, 0.05, "#e8913c");
  }
  // Swingarm and fork.
  r.line(at({ x: -0.05, y: -0.05 }), bike.rear.translation(), 0.07, "#4a4f58");
  r.line(at({ x: 0.34, y: 0.42 }), bike.front.translation(), 0.06, "#c9ccd1");
  // Engine, frame, exhaust.
  r.poly([at({ x: -0.25, y: -0.14 }), at({ x: 0.22, y: -0.14 }), at({ x: 0.3, y: 0.12 }), at({ x: -0.3, y: 0.12 })], "#3a3d44");
  r.line(at({ x: -0.5, y: 0.2 }), at({ x: 0.36, y: 0.38 }), 0.05, "#2a2d33");
  r.line(at({ x: -0.2, y: -0.06 }), at({ x: -0.78, y: 0.1 }), 0.06, "#8a9099");
  // Tank (company orange, with the logo), seat, rear fender, number plate.
  r.poly([at({ x: -0.06, y: 0.16 }), at({ x: 0.3, y: 0.22 }), at({ x: 0.26, y: 0.42 }), at({ x: -0.02, y: 0.38 })], "#f08a3c");
  r.poly([at({ x: -0.5, y: 0.25 }), at({ x: 0.0, y: 0.3 }), at({ x: 0.0, y: 0.36 }), at({ x: -0.48, y: 0.33 })], "#1d1d22");
  r.poly([at({ x: -0.5, y: 0.25 }), at({ x: -0.85, y: 0.32 }), at({ x: -0.85, y: 0.27 }), at({ x: -0.5, y: 0.2 })], "#f08a3c");
  r.poly([at({ x: 0.42, y: 0.3 }), at({ x: 0.58, y: 0.38 }), at({ x: 0.52, y: 0.52 }), at({ x: 0.38, y: 0.44 })], "#f4f1e8");
  const tank = at({ x: 0.12, y: 0.3 });
  r.text("OJ", tank, 0.09, "#fff");
  // Handlebars.
  const b = bike.bars.translation();
  r.line(at({ x: 0.34, y: 0.42 }), b, 0.04, "#2a2d33");
  r.line({ x: b.x - 0.07, y: b.y + 0.02 }, { x: b.x + 0.05, y: b.y - 0.01 }, 0.05, "#1d1d22");
  void game;
  void ctx;
}
