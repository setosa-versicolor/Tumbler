import type { ImpulseJoint } from "@dimforge/rapier2d-deterministic-compat";
import type { Level, Theme } from "../level";
import type { Kit } from "../kit";
import type { Game, GameEvent } from "../../sim/game";
import { RAPIER } from "../../physics/world";
import { FURNITURE_GROUPS } from "../../physics/groups";
import { Panes, launchHeadFirst, spawnProp } from "../smash";

// The Smash Room: what's behind the window in Day Off. Six ways through,
// one after another, and every one of them breaks something. Throw a brick
// through a glass wall; knock out the glass latch holding up a drawbridge;
// take a run at a launch pad and go head first through three panes; break
// the glass on the emergency button; let a wrecking ball loose on a brick
// wall; and then the big one, out through the exit.

const W = 70;
const H = 7;

const WAREHOUSE: Theme = {
  outdoor: false,
  top: "#ddd6c9",
  bottom: "#c6bcab",
  floor: "#4f4a45",
  floorTop: "#6b645c",
  stripe: "rgba(255,255,255,0.10)",
};

/** Where Stanley comes in (through a window, at speed). */
export const ENTRY = { x: 1.0, y: 2.4 };
/** 1. A glass wall, floor to ceiling. Throw a brick through it. */
export const GLASS_WALL = { x: 8.0 };
/**
 * 2. A gap too wide to jump. The drawbridge stands on this side, leaning out
 * over it, tied back by a rope to a glass anchor on a post.
 */
export const PIT = { x0: 14.0, x1: 18.2 };
const BRIDGE = { len: 4.6, lean: 0.1, hingeY: 0.08 };
export const TIE = { x: 13.45, y: 1.55 };
/** 3. A launch pad, and three panes to go through head first. */
export const PAD_1 = { x0: 24.6, x1: 25.6, vel: { x: 8.2, y: 3.6 } };
const TRIPLE = [27.3, 28.2, 29.1];
/** 4. A shutter, opened by the button behind the glass. */
export const DOOR = { x0: 39.0, x1: 39.5, top: 2.6 };
export const BUTTON = { y: 3.2 };
/** 5. The wrecking ball, tied back to the lintel by a glass anchor; a brick wall beyond. */
export const BALL = { pivot: { x: 48.0, y: H }, chain: 6.1, r: 0.6, hold: 0.95 };
export const BRICK_WALL = { x0: 48.65, cols: 3, rows: 14, bw: 0.25, bh: 0.1 };
const ANCHOR = { x: DOOR.x1 + 0.12, y: 2.95 };
/** Bricks (and shards) fall through this grating; Stanley doesn't. */
const GRATE = { x0: 50.3, x1: 55.0 };
/** 6. The way out. */
export const PAD_2 = { x0: 60.0, x1: 61.0, vel: { x: 9.4, y: 4.2 } };
const FINAL = { pane: 62.6, boxes: 63.6, boards: 65.0, window: 66.4 };
/** Past this, he's out. */
export const EXIT_X = 66.8;
const CHECKPOINT = { x: 12.9, y: 0 };

/** Brick chutes: one by each throwing job, topping up while that job's still to do. */
const CHUTES = [
  { x: 5.4, x0: 0, x1: GLASS_WALL.x },
  { x: 11.6, x0: GLASS_WALL.x, x1: PIT.x0 },
  { x: 34.6, x0: 31.5, x1: DOOR.x0 },
  { x: 41.4, x0: DOOR.x1, x1: 44 },
];

const BRICK = (kit: Kit, x: number, y: number) => kit.box(x, y, 0.14, 0.07, { kind: "brick", density: 16, friction: 0.8, color: "#b5523b" });
const cardboard = ["#c9a06a", "#d4ae78", "#bf955c", "#d9b886"];

export const smashRoom: Level = {
  id: "smash-room",
  title: "Smash Room",
  goal: "Everything in here is already paid for.",
  icon: "🔨",
  par: [55, 90],
  bounds: { w: W, h: H },
  spawn: ENTRY,
  theme: WAREHOUSE,
  build(kit) {
    const T = 0.5;
    // Floors either side of the gap (with a bottom to it, out of sight), the grating, the rest.
    kit.solid((PIT.x0 - 1) / 2, -T, (PIT.x0 + 1) / 2, T, "floor");
    kit.solid((PIT.x1 + GRATE.x0) / 2, -T, (GRATE.x0 - PIT.x1) / 2, T, "floor");
    kit.solid((GRATE.x1 + W + 1) / 2, -T, (W + 1 - GRATE.x1) / 2, T, "floor");
    kit.solid((PIT.x0 + PIT.x1) / 2, -3.2, (PIT.x1 - PIT.x0) / 2 + 0.5, 0.2, "floor", { hidden: true });
    kit.solid((GRATE.x0 + GRATE.x1) / 2, -0.03, (GRATE.x1 - GRATE.x0) / 2, 0.03, "floor", { collides: "body" });
    kit.solid((GRATE.x0 + GRATE.x1) / 2, -2.2, (GRATE.x1 - GRATE.x0) / 2 + 0.5, 0.2, "floor", { hidden: true });
    kit.solid(-T, H / 2 + 2, T, H / 2 + 2 + T, "wall");
    kit.solid(W + T, H / 2 + 2, T, H / 2 + 2 + T, "wall");
    kit.solid(W / 2, H + T, W / 2 + T * 2, T, "wall");

    const panes = new Panes(kit);
    /** Furniture things sit on (and Stanley walks past, in front): nothing a hand can grab. */
    const table = (x: number, y: number, hw: number, hh: number) => kit.solid(x, y, hw, hh, "table").setCollisionGroups(FURNITURE_GROUPS);
    // The window he comes in through (smashed on the first step).
    const entrance = panes.add(0.06, 3.7, 0.05, 0.6, { bodySpeed: 99, propSpeed: 99 });

    // ---- 0. Landing: a heap of cardboard boxes. ----
    for (let i = 0; i < 7; i++) {
      const s = 0.26 + (i % 3) * 0.04;
      kit.box(1.3 + (i % 4) * 0.62, s + Math.floor(i / 4) * 0.62 + 0.01, s, s, { kind: "box", density: 2, color: cardboard[i % 4] });
    }

    // ---- 1. The glass wall. ----
    // (Bricks on a waist-high bench: easy to grab.)
    table(5.4, 0.5, 0.7, 0.5);
    for (let i = 0; i < 3; i++) BRICK(kit, 5.0 + i * 0.36, 1.08);
    const wall1 = panes.add(GLASS_WALL.x, H / 2, 0.06, H / 2);
    // Past it: a table of nice things.
    table(10.2, 0.4, 0.8, 0.4);
    kit.fragile(9.7, 0.8, "vase");
    kit.fragile(10.25, 0.8, "trophy");
    kit.fragile(10.75, 0.8, "bottles");

    // ---- 2. The drawbridge. ----
    for (let i = 0; i < 2; i++) BRICK(kit, 11.3 + i * 0.4, 0.08);
    const hinge = { x: PIT.x0, y: BRIDGE.hingeY };
    const up = { x: Math.sin(BRIDGE.lean), y: Math.cos(BRIDGE.lean) };
    const hw = BRIDGE.len / 2;
    const bridge = kit.box(hinge.x + up.x * hw, hinge.y + up.y * hw, hw, 0.07, {
      kind: "plank",
      density: 12,
      friction: 0.9,
      color: "#a8784a",
      angle: Math.PI / 2 - BRIDGE.lean,
      tag: "bridge",
    });
    // (Hinged to a body of its own: a joint to the room would stop it touching anything in the room.)
    const pin = kit.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(hinge.x, hinge.y));
    kit.world.createImpulseJoint(RAPIER.JointData.revolute({ x: 0, y: 0 }, { x: -hw, y: 0 }), pin, bridge.body, true);
    const bridgeTop = { x: hinge.x + up.x * BRIDGE.len, y: hinge.y + up.y * BRIDGE.len };
    let tie: ImpulseJoint | null = kit.world.createImpulseJoint(
      RAPIER.JointData.rope(Math.hypot(bridgeTop.x - TIE.x, bridgeTop.y - TIE.y), TIE, { x: hw, y: 0 }),
      kit.room,
      bridge.body,
      true,
    );
    // The anchor the rope's tied to: a lump of glass on a post (which Stanley walks past, in front of it).
    kit.solid(TIE.x, (TIE.y - 0.14) / 2, 0.05, (TIE.y - 0.14) / 2, "post", { collides: "props", hidden: true });
    const latch = panes.add(TIE.x, TIE.y, 0.13, 0.13, { propSpeed: 2.6, bodySpeed: 3 });

    // ---- 3. Launch pad, three panes. ----
    TRIPLE.forEach((x) => panes.add(x, H / 2, 0.05, H / 2, { bodySpeed: 3.6 }));
    for (let i = 0; i < 6; i++) {
      const s = 0.28;
      kit.box(30.6 + (i % 3) * 0.6, s + Math.floor(i / 3) * 0.58 + 0.01, s, s, { kind: "box", density: 2, color: cardboard[i % 4] });
    }
    kit.fragile(32.4, 0, "lamp");

    // ---- 4. Break glass in case of emergency. ----
    table(34.6, 0.5, 0.6, 0.5);
    for (let i = 0; i < 2; i++) BRICK(kit, 34.35 + i * 0.5, 1.08);
    table(36.9, 0.4, 0.6, 0.4);
    kit.fragile(36.55, 0.8, "bottles");
    kit.fragile(37.25, 0.8, "vase");
    // The lintel over the door, and the shutter under it.
    kit.solid((DOOR.x0 + DOOR.x1) / 2, (DOOR.top + H) / 2, (DOOR.x1 - DOOR.x0) / 2, (H - DOOR.top) / 2, "wall", { hidden: true });
    const shutter = kit.platform((DOOR.x0 + DOOR.x1) / 2, DOOR.top / 2, (DOOR.x1 - DOOR.x0) / 2 - 0.05, DOOR.top / 2);
    const button = kit.button(DOOR.x0, BUTTON.y, 0.07, 0.16);
    // The case: a frame, and the glass across the front.
    const caseX0 = DOOR.x0 - 0.66;
    kit.solid((caseX0 + DOOR.x0) / 2, BUTTON.y + 0.37, (DOOR.x0 - caseX0) / 2, 0.025, "ledge", { hidden: true });
    kit.solid((caseX0 + DOOR.x0) / 2, BUTTON.y - 0.37, (DOOR.x0 - caseX0) / 2, 0.025, "ledge", { hidden: true });
    panes.add(caseX0 + 0.04, BUTTON.y, 0.04, 0.345, { propSpeed: 2.8, bodySpeed: 3 });
    let doorOpen = 0;

    // ---- 5. The wrecking ball. ----
    for (let i = 0; i < 2; i++) BRICK(kit, 41.0 + i * 0.5, 0.08);
    const held = { x: BALL.pivot.x - BALL.chain * Math.sin(BALL.hold), y: BALL.pivot.y - BALL.chain * Math.cos(BALL.hold) };
    const ball = kit.ball(held.x, held.y, BALL.r, { kind: "wreckingball", density: 250, restitution: 0.1, friction: 0.5, color: "#3a3f47" });
    ball.body.setRotation(-BALL.hold, true);
    ball.body.setAngularDamping(2);
    let swingJoint: ImpulseJoint | null = kit.world.createImpulseJoint(RAPIER.JointData.revolute(BALL.pivot, { x: 0, y: BALL.chain }), kit.room, ball.body, true);
    const ropeLen = Math.hypot(held.x - ANCHOR.x, held.y - ANCHOR.y);
    let rope: ImpulseJoint | null = kit.world.createImpulseJoint(RAPIER.JointData.rope(ropeLen, ANCHOR, { x: 0, y: 0 }), kit.room, ball.body, true);
    const anchor = panes.add(ANCHOR.x, ANCHOR.y, 0.12, 0.14, { propSpeed: 2.6, bodySpeed: 3 });
    // A low bench of nice things, right where the ball comes through (it clears the bench; not the things on it).
    table(45.7, 0.2, 0.7, 0.2);
    kit.fragile(45.25, 0.4, "vase");
    kit.fragile(45.75, 0.4, "lamp");
    kit.fragile(46.2, 0.4, "trophy");
    // The wall, and a beam over it (no climbing over).
    const wallTop = BRICK_WALL.rows * (BRICK_WALL.bh * 2 + 0.002);
    for (let row = 0; row < BRICK_WALL.rows; row++)
      for (let col = 0; col < BRICK_WALL.cols; col++)
        kit.box(BRICK_WALL.x0 + BRICK_WALL.bw + col * (BRICK_WALL.bw * 2 + 0.003), BRICK_WALL.bh + row * (BRICK_WALL.bh * 2 + 0.002) + 0.001, BRICK_WALL.bw - 0.002, BRICK_WALL.bh, {
          kind: "brick",
          density: 10,
          friction: 0.9,
          color: (row + col) % 3 ? "#b5523b" : "#a5472f",
        });
    const wallX1 = BRICK_WALL.x0 + BRICK_WALL.cols * (BRICK_WALL.bw * 2 + 0.003);
    kit.solid((BRICK_WALL.x0 + wallX1) / 2, (wallTop + 0.02 + H) / 2, (wallX1 - BRICK_WALL.x0) / 2 + 0.05, (H - wallTop - 0.02) / 2, "wall", { hidden: true });
    let released = -1;
    let winched = false;

    // ---- 6. Out. ----
    panes.add(FINAL.pane, H / 2, 0.05, H / 2, { bodySpeed: 3.4 });
    for (let i = 0; i < 4; i++) kit.box(FINAL.boxes + (i % 2) * 0.62, 0.3 + Math.floor(i / 2) * 0.6 + 0.01, 0.3, 0.3, { kind: "box", density: 2, color: cardboard[i % 4] });
    kit.fragile(FINAL.boxes + 0.3, 1.21, "vase");
    panes.add(FINAL.boards, H / 2, 0.1, H / 2, { material: "wood", bodySpeed: 3.2, propSpeed: 6 });
    panes.add(FINAL.window, H / 2, 0.07, H / 2, { bodySpeed: 3, propSpeed: 4 });
    // Outside: a skip to land in.
    kit.basket(67.6, 69.6, 0.04, 0.8);

    const chuteTimer = CHUTES.map(() => 0);
    const chuteFlash = CHUTES.map(() => 0);
    const chuteOn = [() => !wall1.broken, () => !latch.broken, () => button.presses === 0, () => !anchor.broken];
    let started = false;
    let out = false;
    let padCool = 0;
    let nagged = 0;

    const pad = (game: Game, p: typeof PAD_1, ev: GameEvent[]) => {
      const st = game.stanley;
      const feet = Object.values(st.rig.legs).map((l) => l.shin.translation());
      const on = feet.some((f) => f.x > p.x0 && f.x < p.x1 && f.y < 0.4);
      if (!on || padCool > 0) return;
      const vx = st.rig.pelvis.linvel().x;
      if (vx > 2.3 && st.balance.posture === "up") {
        padCool = 1;
        launchHeadFirst(st, p.vel);
        ev.push({ type: "score", text: "LAUNCH!", pos: { x: (p.x0 + p.x1) / 2, y: 2.0 } });
        ev.push({ type: "sfx", name: "launch" });
      } else if (vx > 0.4 && st.balance.grounded) {
        // Not fast enough: a little boing, and a word of advice.
        padCool = 0.8;
        for (const b of st.rig.bodies) b.setLinvel({ x: b.linvel().x, y: 3.2 }, true);
        ev.push({ type: "sfx", name: "launch" });
        if (nagged <= 0) {
          nagged = 4;
          ev.push({ type: "score", text: "Faster!", pos: { x: (p.x0 + p.x1) / 2, y: 2.2 } });
        }
      }
    };

    return {
      update(game, dt) {
        const ev: GameEvent[] = [];
        const st = game.stanley;
        if (!started) {
          // In through the window, at speed.
          started = true;
          ev.push(...panes.smash(game, entrance, { x: 0.1, y: 3.4 }, { x: 5, y: 0.5 }, true));
          for (const b of st.rig.bodies) b.setLinvel({ x: 2.4, y: 1.0 }, true);
          st.rig.chest.setAngvel(-4, true);
          st.balance.knockDown(0.9);
          st.stunt = true;
        }
        padCool = Math.max(0, padCool - dt);
        nagged -= dt;
        ev.push(...panes.update(game, dt));

        // Bricks: down the chute whenever a throwing job's run out of them.
        const bricks = game.props.filter((p) => p.kind === "brick");
        CHUTES.forEach((c, i) => {
          chuteFlash[i] = Math.max(0, chuteFlash[i] - dt);
          if (!chuteOn[i]()) return;
          const have = bricks.some((b) => {
            const q = b.body.translation();
            return q.x > c.x0 && q.x < c.x1 && q.y > -0.4;
          });
          chuteTimer[i] = have ? 0 : chuteTimer[i] + dt;
          if (chuteTimer[i] > 1.0) {
            chuteTimer[i] = 0;
            chuteFlash[i] = 0.4;
            spawnProp(kit, game, () => BRICK(kit, c.x, 2.55));
            ev.push({ type: "sfx", name: "plop", pos: { x: c.x, y: 2.6 } });
          }
        });

        // The drawbridge: anchor gone, rope gone, and over it goes.
        if (latch.broken && tie) {
          game.world.removeImpulseJoint(tie, true);
          tie = null;
          bridge.body.applyTorqueImpulse(-2, true);
          ev.push({ type: "score", text: "TIMBER!", pos: { x: bridgeTop.x, y: 3.2 } });
        }
        // Once it's down, mind the gap anyway.
        const pel = st.rig.pelvis.translation();
        if (pel.y < -0.8) {
          st.teleport(CHECKPOINT);
          ev.push({ type: "score", text: "Again!", pos: { x: CHECKPOINT.x, y: 2.2 } });
        }

        pad(game, PAD_1, ev);
        pad(game, PAD_2, ev);

        // The shutter goes up when the button's pressed.
        if (button.presses > 0) {
          if (doorOpen === 0) {
            ev.push({ type: "score", text: "DOOR OPEN!", pos: { x: DOOR.x0 - 0.8, y: 2.2 } });
            ev.push({ type: "sfx", name: "alarm" });
          }
          doorOpen = Math.min(1, doorOpen + dt * 0.9);
        }
        const rise = (1 - Math.cos(doorOpen * Math.PI)) / 2;
        shutter.setNextKinematicTranslation({ x: (DOOR.x0 + DOOR.x1) / 2, y: DOOR.top / 2 + rise * (DOOR.top + 0.1) });

        // The wrecking ball: anchor smashed, rope gone, and away it goes.
        if (anchor.broken && rope) {
          game.world.removeImpulseJoint(rope, true);
          rope = null;
          released = game.time;
          ev.push({ type: "score", text: "Uh-oh.", pos: { x: held.x, y: held.y + 1 } });
        }
        // After a couple of swings, the crane winds it up out of the way.
        if (released >= 0 && !winched && game.time - released > 3.4) {
          winched = true;
          if (swingJoint) game.world.removeImpulseJoint(swingJoint, true);
          swingJoint = null;
          ball.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
          ev.push({ type: "sfx", name: "winch" });
        }
        if (winched) {
          const q = ball.body.translation();
          const park = { x: BALL.pivot.x - 0.4, y: 4.4 };
          const k = Math.min(1, dt * 2.2);
          ball.body.setNextKinematicTranslation({ x: q.x + (park.x - q.x) * k, y: q.y + (park.y - q.y) * k });
          ball.body.setNextKinematicRotation(ball.body.rotation() * (1 - k));
        }

        if (!out && pel.x > EXIT_X) out = true;
        return ev;
      },
      progress: (game) => ({
        done: out,
        label: `Smashed ${panes.smashed - 1 + game.breaks}`,
      }),
      drawBack(r, game) {
        const t = game.time;
        // Signs.
        r.text("SMASH ROOM", { x: 2.7, y: 5.9 }, 0.42, "rgba(192,57,43,0.75)", "center", 900);
        r.text("Everything in here is already paid for.", { x: 2.7, y: 5.35 }, 0.14, "rgba(42,34,48,0.55)");
        r.text("(Not billed to your mother.)", { x: 2.7, y: 5.12 }, 0.11, "rgba(42,34,48,0.4)");
        // The window he came in through.
        r.rect(-0.1, 3.0, 0.16, 4.4, "#7a5a40");
        r.rect(-0.05, 3.1, 0.12, 4.3, "#f6e7cf");
        // Brick chutes.
        CHUTES.forEach((c, i) => {
          if (!chuteOn[i]()) return;
          r.rect(c.x - 0.2, 2.75, c.x + 0.2, H, "#7c8a99");
          r.rect(c.x - 0.24, 2.72, c.x + 0.24, 2.86, chuteFlash[i] > 0 ? "#ffd84a" : "#5f6670");
          r.text("BRICKS", { x: c.x, y: 3.4 }, 0.09, "rgba(255,255,255,0.85)", "center", 900);
        });
        r.text("THROW ▸", { x: 6.9, y: 2.0 }, 0.16, "rgba(42,34,48,0.45)");
        // The gap.
        r.rect(PIT.x0, -5, PIT.x1, 0, "#1f1a24");
        r.text("MIND THE GAP", { x: (PIT.x0 + PIT.x1) / 2, y: 4.6 }, 0.16, "rgba(42,34,48,0.45)");
        // The anchor's post.
        r.rect(TIE.x - 0.05, 0, TIE.x + 0.05, TIE.y - 0.12, "#5f6670");
        r.rect(TIE.x - 0.12, TIE.y - 0.16, TIE.x + 0.12, TIE.y - 0.12, "#7a828c");
        // Launch pads.
        for (const p of [PAD_1, PAD_2]) {
          r.rect(p.x0 - 0.4, 0, p.x0, 0.03, "rgba(240,138,60,0.5)");
          r.rect(p.x0, 0, p.x1, 0.06, "#f08a3c");
          for (let x = p.x0 + 0.15; x < p.x1; x += 0.28) r.rect(x - 0.03, 0.06, x + 0.03, 0.1, "#2a2230");
          r.text("LAUNCH PAD", { x: (p.x0 + p.x1) / 2, y: 0.35 }, 0.11, "rgba(42,34,48,0.6)");
          r.text("RUN ▸▸", { x: p.x0 - 1.6, y: 0.35 }, 0.13, "rgba(240,138,60,0.85)");
        }
        // The door: lintel, shutter (whatever's still below the lintel), the button's case.
        r.rect(DOOR.x0, DOOR.top, DOOR.x1, H, "#8a9099");
        r.rect(DOOR.x0 - 0.04, DOOR.top - 0.06, DOOR.x1 + 0.04, DOOR.top, "#5f6670");
        const sy = shutter.translation().y - DOOR.top / 2;
        if (sy < DOOR.top) {
          r.rect(DOOR.x0 + 0.05, sy, DOOR.x1 - 0.05, DOOR.top - 0.06, "#9aa0a8");
          for (let y = sy + 0.15; y < DOOR.top - 0.06; y += 0.18) r.rect(DOOR.x0 + 0.05, y, DOOR.x1 - 0.05, y + 0.03, "rgba(0,0,0,0.18)");
        }
        r.rect(caseX0, BUTTON.y - 0.39, DOOR.x0, BUTTON.y - 0.35, "#c0392b");
        r.rect(caseX0, BUTTON.y + 0.35, DOOR.x0, BUTTON.y + 0.39, "#c0392b");
        r.rect(caseX0 + 0.08, BUTTON.y - 0.35, DOOR.x0, BUTTON.y + 0.35, "rgba(255,255,255,0.35)");
        r.text("IN CASE OF EMERGENCY", { x: DOOR.x0 - 0.33, y: BUTTON.y + 0.6 }, 0.085, "#c0392b", "center", 900);
        r.text("BREAK GLASS", { x: DOOR.x0 - 0.33, y: BUTTON.y + 0.48 }, 0.1, "#c0392b", "center", 900);
        // A warning light that spins once the door's going.
        const lit = doorOpen > 0 && Math.sin(t * 14) > 0;
        r.circle({ x: (DOOR.x0 + DOOR.x1) / 2, y: DOOR.top + 0.25 }, 0.1, lit ? "#ff5a4f" : "#7a3a35");
        // The anchor: a glass jar bolted to the lintel, the rope tied round it.
        r.rect(DOOR.x1, ANCHOR.y - 0.03, ANCHOR.x, ANCHOR.y + 0.03, "#5f6670");
        if (!anchor.broken) r.text("DO NOT BREAK", { x: ANCHOR.x + 0.25, y: ANCHOR.y + 0.32 }, 0.08, "rgba(42,34,48,0.6)", "left");
        // The wrecking ball's beam, and the beam over the brick wall.
        r.rect(BALL.pivot.x - 2, H - 0.18, BALL.pivot.x + 2, H, "#c9962a");
        for (let x = BALL.pivot.x - 1.9; x < BALL.pivot.x + 2; x += 0.4) r.line({ x, y: H - 0.18 }, { x: x + 0.2, y: H }, 0.02, "#5b4b3a");
        r.text("WRECKING BALL", { x: BALL.pivot.x, y: H - 0.4 }, 0.12, "rgba(42,34,48,0.55)");
        r.rect(BRICK_WALL.x0 - 0.05, wallTop + 0.02, wallX1 + 0.05, H, "#8a9099");
        r.rect(BRICK_WALL.x0 - 0.05, wallTop + 0.02, wallX1 + 0.05, wallTop + 0.12, "#5f6670");
        // The grating, over the rubble bin.
        r.rect(GRATE.x0, -5, GRATE.x1, 0, "#1f1a24");
        // Outside, through the exit.
        r.rect(FINAL.window + 0.07, 0, W, H, "#8fd0f0");
        r.rect(FINAL.window + 0.07, 0, W, 1.2, "#bfe6f7");
        r.circle({ x: 68.8, y: 5.4 }, 0.45, "#fff1a8");
        r.rect(FINAL.window + 0.07, -5, W, 0, "#6b9a45");
        r.rect(FINAL.window + 0.07, -0.08, W, 0, "#86b955");
        r.text("EXIT", { x: FINAL.window - 0.9, y: 4.4 }, 0.3, "#37a59c", "center", 900);
        r.text("▸", { x: FINAL.window - 0.3, y: 4.4 }, 0.3, "#37a59c", "center", 900);
      },
      drawMid(r, game) {
        // The wrecking ball's chain (and the rope holding it back).
        if (tie) {
          const a = bridge.body.rotation();
          const p = bridge.body.translation();
          r.line(TIE, { x: p.x + Math.cos(a) * hw, y: p.y + Math.sin(a) * hw }, 0.03, "#c9b8a0");
        }
        const b = ball.body.translation();
        if (rope) r.line(ANCHOR, b, 0.035, "#c9b8a0");
        const top = winched ? { x: BALL.pivot.x, y: H } : BALL.pivot;
        r.line(top, b, 0.05, "#5f6670");
        for (let i = 1; i < 12; i++) {
          const q = { x: top.x + ((b.x - top.x) * i) / 12, y: top.y + ((b.y - top.y) * i) / 12 };
          r.circle(q, 0.04, "#7a828c");
        }
        panes.draw(r, game.time);
        // The grating's bars.
        r.rect(GRATE.x0, -0.06, GRATE.x1, 0, "#7a828c");
        for (let x = GRATE.x0 + 0.1; x < GRATE.x1; x += 0.22) r.rect(x, -0.3, x + 0.05, 0, "#5f6670");
        // The skip, outside.
        r.rect(67.6, 0, 69.6, 0.8, "rgba(46,125,74,0.95)");
        r.text("SKIP", { x: 68.6, y: 0.4 }, 0.16, "rgba(255,255,255,0.8)", "center", 900);
      },
    };
  },
};
