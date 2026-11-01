import { INDOOR, type Level } from "./level";
import { measureStack } from "./stack";
import type { GameEvent } from "../sim/game";
import { RAPIER } from "../physics/world";
import type { RigidBody } from "@dimforge/rapier2d-deterministic-compat";

const W = 32;
/** The ceiling (raised for the trapezes). */
const H = 12;
/** The original room ends here; past it, the fun bit. */
const OLD_W = 16;
/** A shelf of breakables. */
const SHELF = { x0: 16.8, x1: 18.4, y: 2.3 };
/** The trampoline: land on it hard and up you go. */
export const TRAMPOLINE = { x0: 14.0, x1: 15.6, top: 0.22 };
/** The high dive: stairs up to a platform, and a board out over the foam pit. */
const STAIRS = { x0: 19.2, steps: 22, run: 0.3, rise: 0.28 };
export const PLATFORM = { x0: STAIRS.x0 + STAIRS.run * STAIRS.steps, x1: STAIRS.x0 + STAIRS.run * STAIRS.steps + 0.9, y: STAIRS.rise * STAIRS.steps };
const BOARD = { x0: PLATFORM.x1, x1: PLATFORM.x1 + 1.3 };
export const PIT = { x0: PLATFORM.x1 + 0.35, x1: W - 0.1, wall: 0.7 };
/** On the pit's left wall, above the foam: Stanley touches it, and he's back up on the high dive. */
export const LIFT_BUTTON = { x: PIT.x0 + 0.16, y: 1.45, r: 0.15 };
/**
 * Trapezes, from the high dive back over the room to the ledge: each swings
 * on its own (neighbours in opposite directions, so at the end of a swing the
 * next bar comes close). Hang on, let go at the right moment, catch the next.
 */
export const TRAPEZE = { pivots: [24.8, 21.5, 18.2, 14.9, 11.6], top: H, rope: 5.2, swing: 0.31, period: 3.8, hw: 0.35 };
/** How fast a tucked Stanley flips (rad/s). */
const FLIP_SPEED = 11;
/** Up in the air with his middle above this (off the high dive, a trapeze, a big bounce), the stick flips him. */
export const FLIP_HEIGHT = 4;
const FLIP_CALLS = ["Flip!", "Double!", "Triple!", "Quadruple?!"];
const fmtFlips = (n: number) => (Number.isInteger(n) ? `${n}` : `${Math.floor(n) || ""}${n % 1 >= 0.5 ? "½" : "¼"}`);

/** His centre of mass's upward speed. */
function riseOf(bodies: RigidBody[]) {
  let m = 0;
  let vy = 0;
  for (const b of bodies) {
    m += b.mass();
    vy += b.linvel().y * b.mass();
  }
  return vy / m;
}

/** Turn the whole of him, as one, about his middle (a tucked dive). */
function spin(bodies: RigidBody[], w: number) {
  let m = 0;
  let cx = 0;
  let cy = 0;
  let vx = 0;
  let vy = 0;
  for (const b of bodies) {
    const k = b.mass();
    const p = b.translation();
    const v = b.linvel();
    m += k;
    cx += p.x * k;
    cy += p.y * k;
    vx += v.x * k;
    vy += v.y * k;
  }
  cx /= m;
  cy /= m;
  vx /= m;
  vy /= m;
  for (const b of bodies) {
    const p = b.translation();
    b.setLinvel({ x: vx - w * (p.y - cy), y: vy + w * (p.x - cx) }, true);
    b.setAngvel(w, true);
  }
}

/** A punching bag, hanging from the ceiling (hit it, or hang off it). */
const BAG = { x: 16.2, top: H, y: 2.0 };
export const LEDGE = { x0: 10.6, x1: 13.2, y: 2.2, thick: 0.2 };
const BASKET = { x0: 0, x1: 1.4, y: 2.9, lip: 0.55 };

/** The original test room: no goal, just stuff. */
export const dayOff: Level = {
  id: "day-off",
  title: "Day Off",
  goal: "No job today. Mess around.",
  icon: "🛋️",
  par: [0, 0],
  bounds: { w: W, h: H },
  spawn: { x: 2.5, y: 0 },
  theme: INDOOR,
  sandbox: true,
  build(kit) {
    kit.enclosure(W, H);
    kit.solid((LEDGE.x0 + LEDGE.x1) / 2, LEDGE.y, (LEDGE.x1 - LEDGE.x0) / 2, LEDGE.thick / 2, "ledge");
    kit.solid((BASKET.x0 + BASKET.x1) / 2, BASKET.y, (BASKET.x1 - BASKET.x0) / 2, 0.05, "basket");
    kit.solid(BASKET.x1 - 0.05, BASKET.y + BASKET.lip / 2, 0.05, BASKET.lip / 2, "basket");
    // (The old right-hand wall's been knocked through; its button's now on the far wall, over the foam pit.)
    kit.button(W, 2.2);

    const sizes = [0.32, 0.28, 0.26, 0.24, 0.22, 0.2];
    let x = 4.2;
    sizes.forEach((s, i) => {
      kit.box(x, s + (i % 2) * 0.9 + 0.01, s, s * (0.85 + kit.rand() * 0.2));
      x += s * 2 + 0.15 + kit.rand() * 0.2;
    });
    kit.fragile(3.4, 0, "vase");
    kit.ball(8.6, 0.25, 0.18, { color: "#e85d5d" });
    kit.ball(9.3, 0.25, 0.14, { color: "#5d9de8" });
    kit.ball(2.6, 0.25, 0.16, { color: "#7bc96f" });
    kit.box(7.2, 0.08, 0.8, 0.05, { kind: "plank", density: 12, color: "#a8784a" });
    kit.box(12.4, LEDGE.y + 0.4, 0.3, 0.045, { kind: "pizza", density: 10, color: "#f1e3c6" });
    kit.box(11.4, LEDGE.y + 0.35, 0.22, 0.22);

    // ---- The new end of the room. ----
    // The trampoline (springy for things you throw on it too).
    kit.solid((TRAMPOLINE.x0 + TRAMPOLINE.x1) / 2, TRAMPOLINE.top - 0.05, (TRAMPOLINE.x1 - TRAMPOLINE.x0) / 2, 0.05, "ledge", { hidden: true });
    // A shelf of breakables, and a few more about the floor, and things to throw at them.
    // (Up against the back wall: things land on it, Stanley walks past it.)
    kit.solid((SHELF.x0 + SHELF.x1) / 2, SHELF.y - 0.04, (SHELF.x1 - SHELF.x0) / 2, 0.04, "ledge", { collides: "props" });
    kit.fragile(SHELF.x0 + 0.3, SHELF.y, "vase");
    kit.fragile(SHELF.x0 + 0.85, SHELF.y, "trophy");
    kit.fragile(SHELF.x1 - 0.3, SHELF.y, "bottles");
    kit.fragile(13.2, 0, "lamp");
    kit.fragile(18.9, 0, "planter");
    kit.ball(12.6, 0.2, 0.12, { kind: "bowlingball", density: 40, color: "#3b6ea8", restitution: 0.1 });
    kit.ball(17.6, 0.2, 0.15, { color: "#f2c94c" });
    kit.ball(15.0, 0.6, 0.17, { color: "#c58be8" });
    // Pins on the high ledge: something to aim at.
    for (let i = 0; i < 4; i++) {
      const pin = kit.box(LEDGE.x0 + 0.4 + i * 0.3, LEDGE.y + 0.1 + 0.2, 0.085, 0.2, { kind: "pin", density: 5, friction: 0.9, restitution: 0.15, color: "#f4f4f4", dangle: true });
      pin.body.setAngularDamping(1.5);
    }
    // A couch to land on, or flop on, or push about.
    kit.box(1.0, 0.3, 0.75, 0.28, { kind: "sofa", density: 5, friction: 0.8, color: "#5d9de8" });
    // The punching bag, on a chain.
    const bag = kit.box(BAG.x, BAG.y, 0.2, 0.45, { kind: "box", density: 12, color: "#c0392b" });
    kit.world.createImpulseJoint(RAPIER.JointData.revolute({ x: BAG.x, y: BAG.top }, { x: 0, y: BAG.top - BAG.y }), kit.room, bag.body, true);
    // The high dive: stairs, a platform, the board; the foam pit below.
    kit.stairs(STAIRS.x0, 0, STAIRS.steps, STAIRS.run, STAIRS.rise);
    kit.solid((PLATFORM.x0 + PLATFORM.x1) / 2, PLATFORM.y / 2, (PLATFORM.x1 - PLATFORM.x0) / 2, PLATFORM.y / 2, "ledge");
    kit.solid((BOARD.x0 + BOARD.x1) / 2, PLATFORM.y - 0.04, (BOARD.x1 - BOARD.x0) / 2, 0.04, "ledge", { hidden: true });
    kit.solid(PIT.x0, PIT.wall / 2, 0.06, PIT.wall / 2, "basket");
    const foam = ["#e85d5d", "#f2c94c", "#5dd5c8", "#c58be8", "#5d9de8", "#f08a3c"];
    for (let i = 0; i < 30; i++) {
      const fx = PIT.x0 + 0.25 + (i % 10) * ((PIT.x1 - PIT.x0 - 0.4) / 10);
      kit.box(fx, 0.15 + Math.floor(i / 10) * 0.3, 0.13, 0.13, { kind: "box", density: 0.4, friction: 0.7, color: foam[i % foam.length] });
    }
    // The trapezes: bars moved along their swing (so they keep time), which
    // carry Stanley like any handhold while he's hanging on.
    const bars = TRAPEZE.pivots.map((px, i) => {
      const body = kit.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(px, TRAPEZE.top - TRAPEZE.rope));
      kit.world.createCollider(RAPIER.ColliderDesc.cuboid(TRAPEZE.hw, 0.035).setFriction(1), body);
      body.userData = { handhold: true };
      return { px, body, phase: i % 2 ? Math.PI : 0 };
    });
    const swingAt = (t: number, phase: number) => TRAPEZE.swing * Math.sin((2 * Math.PI * t) / TRAPEZE.period + phase);
    let catches = 0;
    let holding: unknown = null;
    let bestDive = 0;
    /** High up in the air: the stick flips him till he lands (or catches something). */
    let diving = false;
    let spun = 0;
    /** How fast he may be going up, mid-dive (so a flip that clips the platform can't fling him to the ceiling). */
    let lift = 0;
    let flips = 0;
    let bestFlips = 0;
    let wasHigh = false;
    let bounceCooldown = 0;
    let liftLit = 0;

    let inBasket = 0;
    let stack = 0;
    let best = 0;
    return {
      update(game, dt) {
        // The trampoline: land on it coming down hard enough, and up you go (higher each time).
        bounceCooldown -= dt;
        const st = game.stanley;
        const feet = Object.values(st.rig.legs).map((l) => l.shin.translation());
        const pv = st.rig.pelvis.linvel();
        const boing: GameEvent[] = [];
        if (bounceCooldown <= 0 && pv.y < -1.5 && feet.some((f) => f.x > TRAMPOLINE.x0 && f.x < TRAMPOLINE.x1 && f.y < TRAMPOLINE.top + 0.3)) {
          bounceCooldown = 0.3;
          const up = Math.min(9, Math.max(4.5, -pv.y * 1.05 + 0.8));
          for (const b of st.rig.bodies) b.setLinvel({ x: b.linvel().x, y: up }, true);
          boing.push({ type: "score", text: "BOING!", pos: { x: (TRAMPOLINE.x0 + TRAMPOLINE.x1) / 2, y: 1.2 } });
          diving = false;
        }
        for (const p of game.props) {
          const q = p.body.translation();
          const v = p.body.linvel();
          if (q.x > TRAMPOLINE.x0 && q.x < TRAMPOLINE.x1 && q.y - p.hh < TRAMPOLINE.top + 0.05 && v.y < -1) p.body.setLinvel({ x: v.x, y: -v.y * 0.85 }, true);
        }
        // The trapezes swing.
        for (const b of bars) {
          const a = swingAt(game.time + dt, b.phase);
          b.body.setNextKinematicTranslation({ x: b.px + Math.sin(a) * TRAPEZE.rope, y: TRAPEZE.top - Math.cos(a) * TRAPEZE.rope });
          b.body.setNextKinematicRotation(a);
        }
        const onBar = [st.grips.L.held, st.grips.R.held].find((h) => h && bars.some((b) => b.body === h)) ?? null;
        if (onBar && onBar !== holding) {
          catches++;
          const q = (onBar as { translation(): { x: number; y: number } }).translation();
          boing.push({ type: "score", text: catches > 1 ? "Catch!" : "Hup!", pos: { x: q.x, y: q.y + 0.6 } });
        }
        holding = onBar;

        // The button on the pit wall (Stanley's touch only; foam blocks don't count): back to the top.
        liftLit = Math.max(0, liftLit - dt);
        if (liftLit === 0 && st.rig.bodies.some((b) => {
          const q = b.translation();
          return Math.hypot(q.x - LIFT_BUTTON.x, q.y - LIFT_BUTTON.y) < LIFT_BUTTON.r + 0.13;
        })) {
          liftLit = 1;
          st.teleport({ x: PLATFORM.x0 + 0.35, y: PLATFORM.y });
          // (On his feet, ready to go again.)
          st.balance.posture = "up";
          st.balance.stability = 1;
          diving = false;
          boing.push({ type: "score", text: "Going up!", pos: { x: PLATFORM.x0 + 0.4, y: PLATFORM.y + 1.6 } });
        }

        // Diving: how high was he when he went off the board?
        const pel = st.rig.pelvis.translation();
        const high = pel.y > PLATFORM.y + 0.5 && pel.x > PLATFORM.x0;
        if (wasHigh && !high && pel.x > BOARD.x0) bestDive = Math.max(bestDive, PLATFORM.y);
        // Up in the air, high (off the board, let go of a trapeze, a big bounce):
        // he's diving, and the stick tucks and flips him until he lands.
        const hanging = st.grips.L.holdingStatic || st.grips.R.holdingStatic || !!onBar;
        if (!diving && !st.balance.grounded && !hanging && pel.y > FLIP_HEIGHT) {
          diving = true;
          spun = 0;
          flips = 0;
          lift = Math.max(0, riseOf(st.rig.bodies));
        }
        if (diving) {
          const move = game.intent.move;
          if (Math.abs(move) > 0.2) spin(st.rig.bodies, -Math.sign(move) * FLIP_SPEED);
          lift = Math.max(0, lift - 9.81 * dt);
          const extra = riseOf(st.rig.bodies) - lift - 0.5;
          if (extra > 0) for (const b of st.rig.bodies) b.setLinvel({ x: b.linvel().x, y: b.linvel().y - extra }, true);
          spun += Math.abs(st.rig.chest.angvel()) * dt;
          if (spun > (flips + 1) * Math.PI * 2 - 0.3) {
            flips++;
            boing.push({ type: "score", text: FLIP_CALLS[Math.min(flips, FLIP_CALLS.length) - 1], pos: { x: pel.x, y: pel.y + 0.9 } });
          }
          // Down: how many was that?
          if (st.balance.grounded || hanging || pel.y < PIT.wall + 0.6) {
            diving = false;
            const half = Math.round((spun / Math.PI) * 2) / 4;
            if (half >= 0.5) boing.push({ type: "score", text: `${fmtFlips(half)} ${half === 1 ? "flip" : "flips"}!`, pos: { x: pel.x, y: pel.y + 1.2 } });
            bestFlips = Math.max(bestFlips, half);
          }
        }
        wasHigh = high;

        const n = game.props.filter((p) => {
          const q = p.body.translation();
          return q.x > BASKET.x0 && q.x < BASKET.x1 && q.y > BASKET.y && q.y < BASKET.y + BASKET.lip + 0.3;
        }).length;
        const ev: GameEvent[] = n > inBasket ? [{ type: "score", text: "SWISH!", pos: { x: 0.9, y: 3.8 } }, ...boing] : boing;
        inBasket = n;
        stack = measureStack(game.props, game.held, 0, (p) => {
          const q = p.body.translation();
          return q.x > LEDGE.x0 - 0.3 && q.x < LEDGE.x1 + 0.3 && q.y > LEDGE.y;
        });
        best = Math.max(best, stack);
        return ev;
      },
      progress: (game) => ({
        done: false,
        label: `Basket ${inBasket} · Stack ${best.toFixed(1)}m · Smashed ${game.breaks}${catches ? ` · Trapeze ${catches}` : bestFlips ? ` · ${fmtFlips(bestFlips)} flips` : bestDive ? " · Dove!" : ""}`,
      }),
      drawBack(r, game) {
        // The trapezes: two ropes and a bar each.
        for (const b of bars) {
          const p = b.body.translation();
          const a = b.body.rotation();
          const end = (s: number) => ({ x: p.x + Math.cos(a) * TRAPEZE.hw * s, y: p.y + Math.sin(a) * TRAPEZE.hw * s });
          const top = (s: number) => ({ x: b.px + s * TRAPEZE.hw * 0.8, y: TRAPEZE.top });
          r.line(top(-1), end(-1), 0.018, "#c9b8a0");
          r.line(top(1), end(1), 0.018, "#c9b8a0");
          r.line(end(-1), end(1), 0.06, "#e85d5d");
        }
        // The knocked-through wall, the new end of the room.
        r.rect(OLD_W - 0.05, 2.3, OLD_W + 0.25, H, "rgba(42,34,48,0.08)");
        r.text("FUN ZONE (UNSUPERVISED)", { x: 22, y: 10.6 }, 0.22, "rgba(42,34,48,0.35)");
        // Shelf bracket, the trampoline's legs and springs, the punching bag's chain.
        r.rect(SHELF.x0 + 0.1, 0, SHELF.x0 + 0.16, SHELF.y, "#7c8a99");
        r.rect(SHELF.x1 - 0.16, 0, SHELF.x1 - 0.1, SHELF.y, "#7c8a99");
        for (const x of [TRAMPOLINE.x0 + 0.1, TRAMPOLINE.x1 - 0.1]) r.rect(x - 0.03, 0, x + 0.03, TRAMPOLINE.top, "#5f6670");
        r.rect(TRAMPOLINE.x0, TRAMPOLINE.top - 0.05, TRAMPOLINE.x1, TRAMPOLINE.top + 0.01, "#2a2230");
        r.rect(TRAMPOLINE.x0 - 0.05, TRAMPOLINE.top - 0.07, TRAMPOLINE.x0 + 0.08, TRAMPOLINE.top + 0.02, "#5d9de8");
        r.rect(TRAMPOLINE.x1 - 0.08, TRAMPOLINE.top - 0.07, TRAMPOLINE.x1 + 0.05, TRAMPOLINE.top + 0.02, "#5d9de8");
        // The high dive: platform, ladder rail, the board, a sign.
        r.rect(PLATFORM.x0, 0, PLATFORM.x1, PLATFORM.y, "#7c8a99");
        r.rect(PLATFORM.x0 + 0.05, PLATFORM.y, PLATFORM.x0 + 0.1, PLATFORM.y + 0.9, "#5f6670");
        r.rect(PLATFORM.x0 + 0.05, PLATFORM.y + 0.85, PLATFORM.x1 - 0.2, PLATFORM.y + 0.9, "#5f6670");
        r.rect(BOARD.x0, PLATFORM.y - 0.08, BOARD.x1, PLATFORM.y, "#e2f0f8");
        r.text("HIGH DIVE", { x: (PLATFORM.x0 + PLATFORM.x1) / 2, y: PLATFORM.y + 1.25 }, 0.16, "#3b6ea8");
        r.text("(do not)", { x: (PLATFORM.x0 + PLATFORM.x1) / 2, y: PLATFORM.y + 1.05 }, 0.1, "rgba(42,34,48,0.5)");
        r.text("FOAM PIT", { x: (PIT.x0 + PIT.x1) / 2, y: 1.3 }, 0.18, "rgba(42,34,48,0.4)");
        // The punching bag's chain.
        const bp = game.props.find((p) => p.kind === "box" && Math.abs(p.hh - 0.45) < 0.01 && p.color === "#c0392b");
        if (bp) r.line({ x: BAG.x, y: BAG.top }, bp.body.translation(), 0.02, "#7a828c");
        for (let y = 1; y < H; y++) r.text(`${y}m`, { x: 1.9, y: y - 0.06 }, 0.14, "rgba(42,34,48,0.35)", "left");
        // Ledge bracket.
        r.rect(LEDGE.x1 - 0.43, 0, LEDGE.x1 - 0.37, LEDGE.y, "#7c8a99");
        if (best > 0.3) {
          r.dashed({ x: 2, y: best }, { x: 9.6, y: best }, "rgba(240,138,60,0.7)");
          r.text(`best stack ${best.toFixed(2)}m`, { x: 8.6, y: best + 0.1 }, 0.14, "rgba(240,138,60,0.9)");
        }
      },
      drawFront(r) {
        r.rect(PIT.x0 - 0.06, 0, PIT.x0 + 0.06, PIT.wall, "#e85d5d");
        // The back-to-the-top button: on a post up the pit's left wall.
        r.rect(PIT.x0 - 0.04, PIT.wall, PIT.x0 + 0.04, LIFT_BUTTON.y, "#7c8a99");
        r.circle(LIFT_BUTTON, LIFT_BUTTON.r + 0.03, "#2a2230");
        r.circle(LIFT_BUTTON, LIFT_BUTTON.r, liftLit > 0 ? "#ffe066" : "#5dd5c8");
        r.text("↑", { x: LIFT_BUTTON.x, y: LIFT_BUTTON.y - 0.08 }, 0.2, "#2a2230", "center", 700);
        r.text("TO THE TOP", { x: LIFT_BUTTON.x + 0.05, y: LIFT_BUTTON.y + LIFT_BUTTON.r + 0.1 }, 0.1, "rgba(42,34,48,0.6)");
        r.rect(BASKET.x0, BASKET.y, BASKET.x1, BASKET.y + BASKET.lip, "rgba(185,138,79,0.92)");
        r.text("BASKET", { x: 0.7, y: BASKET.y + 0.2 }, 0.16, "rgba(255,255,255,0.9)");
      },
    };
  },
};
