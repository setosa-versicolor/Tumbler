import { beforeAll, describe, expect, it } from "vitest";
import { initPhysics } from "../src/physics/world";
import { Game, type GameEvent } from "../src/sim/game";
import { DEFAULT_TUNING } from "../src/sim/tuning";
import { IDLE_INTENT, type Intent } from "../src/physics/body/stanley";
import * as SR from "../src/levels/secret/smashRoom";
import { smashRoom } from "../src/levels/secret/smashRoom";
import { dayOff } from "../src/levels/dayOff";
import * as DAY_OFF from "../src/levels/dayOff";
import type { Prop } from "../src/levels/kit";

beforeAll(() => initPhysics());

const play = (level = smashRoom) => new Game({ ...DEFAULT_TUNING, trippiness: 0 }, level);
/** Run, collecting events. */
const run = (g: Game, seconds: number, intent: Partial<Intent> | ((t: number) => Partial<Intent>) = {}) => {
  const events: GameEvent[] = [];
  const steps = Math.round(seconds * 120);
  for (let i = 0; i < steps; i++) events.push(...g.step({ ...IDLE_INTENT, ...(typeof intent === "function" ? intent(i / 120) : intent) }));
  return events;
};
const smashes = (ev: GameEvent[]) => ev.filter((e) => e.type === "smash");
/** Put Stanley on his feet at x. */
const standAt = (g: Game, x: number) => {
  g.stanley.teleport({ x, y: 0 });
  run(g, 1.2);
};
/** Fling a brick from `from` at `to`, arriving in about `t` seconds. */
const lob = (g: Game, from: { x: number; y: number }, to: { x: number; y: number }, t = 0.5): Prop => {
  const d = (p: Prop) => Math.abs(p.body.translation().x - from.x);
  const b = g.props.filter((p) => p.kind === "brick").sort((a, c) => d(a) - d(c))[0];
  b.body.setTranslation(from, true);
  b.body.setLinvel({ x: (to.x - from.x) / t, y: (to.y - from.y) / t + 0.5 * 9.81 * t }, true);
  return b;
};
const physicsOk = (g: Game) => {
  for (const b of [...g.stanley.rig.bodies, ...g.props.map((p) => p.body)]) {
    const p = b.translation();
    expect(Number.isFinite(p.x + p.y)).toBe(true);
  }
};

describe("Smash Room", () => {
  it("Stanley crashes in through a window and lands in the boxes, then gets up", () => {
    const g = play();
    const ev = run(g, 0.1);
    expect(smashes(ev).length).toBe(1);
    run(g, 3);
    expect(g.stanley.balance.posture).toBe("up");
    expect(g.falls).toBe(0);
    const p = g.stanley.rig.pelvis.translation();
    expect(p.x).toBeGreaterThan(0.5);
    expect(p.x).toBeLessThan(SR.GLASS_WALL.x);
    expect(g.progress.label).toBe("Smashed 0");
    physicsOk(g);
  });

  it("the glass wall stops him, but a thrown brick goes straight through it", () => {
    const g = play();
    run(g, 2);
    const brick = lob(g, { x: 6.5, y: 1.8 }, { x: SR.GLASS_WALL.x + 1, y: 1.8 }, 0.25);
    const ev = run(g, 0.5);
    expect(smashes(ev).length).toBe(1);
    expect(brick.body.translation().x).toBeGreaterThan(SR.GLASS_WALL.x);
    expect(g.progress.label).toMatch(/^Smashed [1-9]/);
    // Now he can walk on through.
    run(g, 6, { move: 0.5 });
    expect(g.stanley.rig.pelvis.translation().x).toBeGreaterThan(SR.GLASS_WALL.x + 1);
  });

  it("walking into the glass: it's in the way (and doesn't knock him over)", () => {
    const g = play();
    run(g, 2);
    for (const p of g.props.filter((p) => p.kind === "brick" && p.body.translation().x < SR.GLASS_WALL.x)) p.body.setTranslation({ x: 2, y: 3 }, true);
    const ev = run(g, 3, { move: 0.5 });
    expect(g.stanley.rig.pelvis.translation().x).toBeLessThan(SR.GLASS_WALL.x);
    expect(g.stanley.rig.pelvis.translation().x).toBeGreaterThan(SR.GLASS_WALL.x - 1);
    expect(ev.some((e) => e.type === "ouch")).toBe(false);
  });

  it("sprinting into the glass: THUNK", () => {
    const g = play();
    run(g, 2);
    for (const p of g.props.filter((p) => p.kind === "brick" && p.body.translation().x < SR.GLASS_WALL.x)) p.body.setTranslation({ x: 2, y: 3 }, true);
    const ev = run(g, 3, { move: 1 });
    expect(ev.some((e) => e.type === "ouch")).toBe(true);
    expect(smashes(ev).length).toBe(0);
  });

  it("a real wind-up and throw is plenty to smash it", () => {
    const g = play();
    run(g, 1);
    // (On the runway, nothing else about: a long throw at the first of the three panes.)
    g.stanley.teleport({ x: 22, y: 0 });
    run(g, 1.5);
    const b = g.props.find((p) => p.kind === "brick")!;
    // Hold it out in front, about chest height, and grab.
    b.body.setTranslation({ x: 22.45, y: 1.1 }, true);
    b.body.setRotation(0, true);
    b.body.setGravityScale(0, true);
    const grip = { L: false, R: true };
    run(g, 0.8, () => ({ reach: { ...b.body.translation() }, grip }));
    b.body.setGravityScale(1, true);
    expect(g.stanley.grips.R.held).toBe(b.body);
    const s = () => g.stanley.shoulder;
    run(g, 0.5, () => ({ reach: { x: s().x - 0.7, y: s().y - 0.1 }, grip }));
    const ev = [...run(g, 0.12, () => ({ reach: { x: s().x + 0.9, y: s().y + 0.5 }, grip })), ...run(g, 2.5)];
    expect(ev.some((e) => e.type === "throw")).toBe(true);
    expect(smashes(ev).length).toBeGreaterThan(0);
  });

  it("a gentle lob only cracks the glass; three cracks and it goes anyway", () => {
    const g = play();
    run(g, 2);
    for (let i = 0; i < 3; i++) {
      lob(g, { x: 7.0, y: 1.5 }, { x: SR.GLASS_WALL.x + 0.2, y: 1.5 }, 0.45);
      const ev = run(g, 1.5);
      if (i < 2) expect(smashes(ev).length).toBe(0);
      else expect(smashes(ev).length).toBe(1);
    }
  });

  it("the brick chute tops up when the bricks run out", () => {
    const g = play();
    run(g, 2);
    for (const p of g.props.filter((p) => p.kind === "brick" && p.body.translation().x < SR.GLASS_WALL.x)) g.removeProp(p);
    const ev = run(g, 2.5);
    expect(ev.some((e) => e.type === "sfx" && e.name === "plop")).toBe(true);
    expect(g.props.some((p) => p.kind === "brick" && p.body.translation().x < SR.GLASS_WALL.x)).toBe(true);
  });

  it("knock out the glass anchor and the drawbridge comes down across the gap", () => {
    const g = play();
    run(g, 1);
    const bridge = g.props.find((p) => p.tag === "bridge")!;
    run(g, 2);
    expect(Math.abs(bridge.body.rotation() - Math.PI / 2)).toBeLessThan(0.2);
    lob(g, { x: 11.8, y: 1.5 }, { x: SR.TIE.x + 0.5, y: SR.TIE.y }, 0.3);
    const ev = run(g, 4);
    expect(smashes(ev).length).toBe(1);
    // Lying flat across the gap, near enough.
    const a = bridge.body.rotation();
    expect(Math.abs(Math.sin(a))).toBeLessThan(0.12);
    expect(bridge.body.translation().x).toBeGreaterThan(SR.PIT.x0);
    expect(bridge.body.translation().x).toBeLessThan(SR.PIT.x1);
    // ...and he walks over it.
    standAt(g, 12.8);
    run(g, 6, () => ({ move: g.stanley.rig.pelvis.translation().x < SR.PIT.x1 + 1.5 ? 0.6 : 0 }));
    expect(g.stanley.rig.pelvis.translation().x).toBeGreaterThan(SR.PIT.x1 + 0.5);
    expect(g.stanley.rig.pelvis.translation().y).toBeGreaterThan(0.5);
  });

  it("falling in the gap puts him back at the edge", () => {
    const g = play();
    run(g, 1);
    g.stanley.teleport({ x: (SR.PIT.x0 + SR.PIT.x1) / 2, y: 0.5 });
    const ev = run(g, 2);
    expect(ev.some((e) => e.type === "score" && e.text === "Again!")).toBe(true);
    expect(g.stanley.rig.pelvis.translation().x).toBeLessThan(SR.PIT.x0);
  });

  it("a run at the launch pad sends him head first through all three panes", () => {
    const g = play();
    run(g, 1);
    standAt(g, 19.5);
    const ev = run(g, 4, { move: 1 });
    expect(ev.some((e) => e.type === "score" && e.text === "LAUNCH!")).toBe(true);
    const through = smashes(ev).filter((e) => e.type === "smash" && e.big);
    expect(through.length).toBe(3);
    expect(g.stanley.rig.pelvis.translation().x).toBeGreaterThan(29.5);
    // A stunt, not a fall.
    expect(g.falls).toBe(0);
    physicsOk(g);
  });

  it("walking onto the launch pad just boings him (and tells him to run)", () => {
    const g = play();
    run(g, 1);
    standAt(g, 22.5);
    const ev = run(g, 3, { move: 0.35 });
    expect(ev.some((e) => e.type === "score" && e.text === "LAUNCH!")).toBe(false);
    expect(ev.some((e) => e.type === "score" && e.text === "Faster!")).toBe(true);
    expect(g.stanley.rig.pelvis.translation().x).toBeLessThan(27.3);
  });

  it("a brick through the emergency glass hits the button, and the shutter goes up", () => {
    const g = play();
    run(g, 1);
    standAt(g, 36.0);
    // The shutter's down: he can't get past.
    run(g, 3, { move: 0.6 });
    expect(g.stanley.rig.pelvis.translation().x).toBeLessThan(SR.DOOR.x0);
    lob(g, { x: 37.4, y: 3.0 }, { x: SR.DOOR.x0 - 0.05, y: SR.BUTTON.y }, 0.22);
    const ev = run(g, 2.5);
    expect(smashes(ev).length).toBe(1);
    expect(ev.some((e) => e.type === "score" && e.text === "DOOR OPEN!")).toBe(true);
    run(g, 5, { move: 0.6 });
    expect(g.stanley.rig.pelvis.translation().x).toBeGreaterThan(SR.DOOR.x1 + 0.5);
  });

  it("smash the anchor and the wrecking ball takes the brick wall out, then winds up out of the way", () => {
    const g = play();
    run(g, 1);
    const wall = g.props.filter((p) => p.kind === "brick" && p.body.translation().x > SR.BRICK_WALL.x0 - 0.1 && p.body.translation().x < SR.BRICK_WALL.x0 + 1.6);
    expect(wall.length).toBe(SR.BRICK_WALL.rows * SR.BRICK_WALL.cols);
    const ball = g.props.find((p) => p.kind === "wreckingball")!;
    // Held back: it doesn't move.
    const before = { ...ball.body.translation() };
    run(g, 1);
    expect(Math.hypot(ball.body.translation().x - before.x, ball.body.translation().y - before.y)).toBeLessThan(0.05);
    lob(g, { x: 41.2, y: 2.4 }, { x: SR.DOOR.x1 + 0.12, y: 2.95 }, 0.25);
    run(g, 6);
    const moved = wall.filter((b) => !g.props.includes(b) || b.body.translation().x > SR.BRICK_WALL.x0 + 1.8 || Math.abs(b.body.rotation()) > 0.3);
    expect(moved.length).toBeGreaterThan(wall.length * 0.5);
    // Out of the way, up near the ceiling.
    expect(ball.body.translation().y - SR.BALL.r).toBeGreaterThan(2.2);
    // He can get through to the far side.
    standAt(g, 45);
    run(g, 10, () => ({ move: g.stanley.rig.pelvis.translation().x < 56 ? 0.7 : 0, jump: Math.round(g.time * 120) % 90 === 0 }));
    expect(g.stanley.rig.pelvis.translation().x).toBeGreaterThan(53);
    physicsOk(g);
  });

  it("the last launch goes through glass, boxes and boards and out of the window: done", () => {
    const g = play();
    run(g, 1);
    standAt(g, 55.5);
    const ev = run(g, 4, { move: 1 });
    expect(ev.some((e) => e.type === "score" && e.text === "LAUNCH!")).toBe(true);
    expect(smashes(ev).filter((e) => e.type === "smash" && e.big).length).toBe(3);
    expect(g.progress.done).toBe(true);
  });
});

describe("Day Off's window", () => {
  it("there's a big trapeze at the end of the line, swinging out toward the window", () => {
    const g = play(dayOff);
    let minX = Infinity;
    let fastest = 0;
    for (let i = 0; i < 120 * DAY_OFF.TRAPEZE.period; i++) {
      g.step(IDLE_INTENT);
      g.world.forEachRigidBody((b) => {
        if (!(b.userData as { handhold?: boolean } | undefined)?.handhold) return;
        const x = b.translation().x;
        minX = Math.min(minX, x);
        if (x < DAY_OFF.BIG_TRAPEZE.pivot + 1) fastest = Math.max(fastest, Math.abs(b.linvel().x));
      });
    }
    // Out to within a metre of the wall, and going at a fair lick on the way.
    expect(minX).toBeLessThan(1.1);
    expect(fastest).toBeGreaterThan(4);
  });

  it("flying into it, Stanley smashes through and is off to the Smash Room", () => {
    const g = play(dayOff);
    run(g, 0.5);
    // As if he'd let go of the big trapeze on the way out (how fast it's going there, how high he hangs).
    g.stanley.teleport({ x: 2.3, y: 4.4 });
    for (const b of g.stanley.rig.bodies) b.setLinvel({ x: -4.2, y: 1.0 }, true);
    const ev = run(g, 1.5);
    expect(smashes(ev).length).toBe(1);
    expect(ev.some((e) => e.type === "warp" && e.to === "smash-room")).toBe(true);
  });

  it("walking about in Day Off never finds it by accident", () => {
    const g = play(dayOff);
    const ev = run(g, 6, { move: -1 });
    expect(smashes(ev).length).toBe(0);
  });
});
