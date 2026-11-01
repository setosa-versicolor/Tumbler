import { beforeAll, describe, expect, it } from "vitest";
import { initPhysics } from "../src/physics/world";
import { Game } from "../src/sim/game";
import { DEFAULT_TUNING } from "../src/sim/tuning";
import { IDLE_INTENT, type Intent } from "../src/physics/body/stanley";
import { wrapAngle } from "../src/sim/math";
import { dayOff, LEDGE } from "../src/levels/dayOff";

beforeAll(() => initPhysics());

const run = (game: Game, seconds: number, intent: Partial<Intent> | ((t: number) => Partial<Intent>) = {}) => {
  const steps = Math.round(seconds * 120);
  for (let i = 0; i < steps; i++) {
    const it = typeof intent === "function" ? intent(i / 120) : intent;
    game.step({ ...IDLE_INTENT, ...it });
  }
};

const pelvis = (g: Game) => g.stanley.rig.pelvis.translation();
const tilt = (g: Game) => Math.abs(wrapAngle(g.stanley.rig.chest.rotation()));

// These test the controller itself, so tripping is switched off.
describe("Stanley's body", () => {
  it("stands upright on its own", () => {
    const g = new Game({ ...DEFAULT_TUNING, trippiness: 0 }, dayOff);
    run(g, 4);
    expect(tilt(g)).toBeLessThan(0.25);
    expect(pelvis(g).y).toBeGreaterThan(0.75);
    expect(pelvis(g).y).toBeLessThan(1.05);
    expect(g.stanley.balance.posture).toBe("up");
  });

  it("runs right and left", () => {
    const g = new Game({ ...DEFAULT_TUNING, trippiness: 0 }, dayOff);
    run(g, 1);
    const x0 = pelvis(g).x;
    run(g, 1.5, { move: 1 });
    const x1 = pelvis(g).x;
    expect(x1 - x0).toBeGreaterThan(2.5);
    run(g, 1.5, { move: -1 });
    expect(pelvis(g).x).toBeLessThan(x1 - 2.5);
    run(g, 1);
    expect(g.stanley.balance.posture).toBe("up");
  });

  it("jumps", () => {
    const g = new Game({ ...DEFAULT_TUNING, trippiness: 0 }, dayOff);
    run(g, 1);
    const y0 = pelvis(g).y;
    g.step({ ...IDLE_INTENT, jump: true });
    let maxY = y0;
    for (let i = 0; i < 90; i++) {
      g.step(IDLE_INTENT);
      maxY = Math.max(maxY, pelvis(g).y);
    }
    expect(maxY - y0).toBeGreaterThan(0.6);
    // Jumping and landing shouldn't knock Stanley over.
    expect(g.stanley.balance.posture).toBe("up");
  });

  it("reaches toward a target with the hands", () => {
    const g = new Game({ ...DEFAULT_TUNING, trippiness: 0 }, dayOff);
    run(g, 1);
    const s = g.stanley.shoulder;
    const target = { x: s.x + 0.5, y: s.y + 0.3 };
    run(g, 1, { reach: target });
    const h = g.stanley.rig.arms.R.hand.translation();
    expect(Math.hypot(h.x - target.x, h.y - target.y)).toBeLessThan(0.2);
  });

  it("grabs, lifts and throws a box", () => {
    const g = new Game({ ...DEFAULT_TUNING, trippiness: 0 }, dayOff);
    run(g, 1);
    // First box in the pile is at x≈4.2. Walk up to it, reach down and grab.
    run(g, 2, (t) => ({ move: pelvis(g).x < 3.5 && t < 1.5 ? 1 : 0 }));
    const box = g.props[0].body;
    run(g, 1.5, () => ({ reach: { x: box.translation().x - 0.3, y: box.translation().y }, grip: { L: true, R: true } }));
    expect(g.stanley.grips.R.held ?? g.stanley.grips.L.held).toBe(box);
    const s = g.stanley.shoulder;
    run(g, 1, { reach: { x: s.x + 0.2, y: s.y + 0.6 }, grip: { L: true, R: true } });
    expect(box.translation().y).toBeGreaterThan(1.2);
    run(g, 0.05, { grip: { L: false, R: false }, reach: { x: s.x + 0.6, y: s.y + 0.2 } });
    expect(g.stanley.grips.R.held).toBeNull();
  });

  it("gets back up after being knocked down", () => {
    const g = new Game({ ...DEFAULT_TUNING, trippiness: 0 }, dayOff);
    run(g, 1);
    // Knocked toward the open floor (not into the boxes, where he might end up leaning on one).
    for (const b of g.stanley.rig.bodies) b.applyImpulse({ x: -b.mass() * 5, y: 0 }, true);
    run(g, 0.3);
    expect(g.stanley.balance.posture).not.toBe("up");
    run(g, 4);
    expect(g.stanley.balance.posture).toBe("up");
    expect(tilt(g)).toBeLessThan(0.3);
  });

  it("never explodes under random mashing", () => {
    const g = new Game({ ...DEFAULT_TUNING, trippiness: 0 }, dayOff);
    let seed = 7;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let intent: Intent = IDLE_INTENT;
    for (let i = 0; i < 120 * 30; i++) {
      if (i % 30 === 0) {
        const p = g.stanley.position;
        intent = {
          move: r() * 2 - 1,
          jump: r() < 0.15,
          reach: r() < 0.8 ? { x: p.x + r() * 3 - 1.5, y: p.y + r() * 3 - 1.5 } : null,
          grip: { L: r() < 0.5, R: r() < 0.5 },
        };
      }
      g.step(intent);
      for (const b of g.stanley.rig.bodies) {
        const v = b.linvel();
        expect(Number.isFinite(v.x) && Math.hypot(v.x, v.y) < 60).toBe(true);
      }
    }
    const p = g.stanley.position;
    expect(p.x > 0 && p.x < dayOff.bounds.w && p.y > 0 && p.y < 8).toBe(true);
  });
  it("can climb onto the ledge", () => {
    const g = new Game({ ...DEFAULT_TUNING, trippiness: 0 }, dayOff);
    // Stand just left of the ledge.
    for (const body of g.stanley.rig.bodies) {
      const p = body.translation();
      body.setTranslation({ x: p.x + 7.6, y: p.y + 0.1 }, true);
    }
    run(g, 1);
    const hold = { L: true, R: true };
    const s = () => g.stanley.shoulder;
    // Jump and grab the lip.
    run(g, 0.6, (t) => ({ jump: t === 0, reach: { x: LEDGE.x0 + 0.15, y: 3.0 }, grip: hold }));
    expect(g.stanley.grips.L.holdingStatic || g.stanley.grips.R.holdingStatic).toBe(true);
    // Push down on it to haul up, swing over, let go.
    run(g, 1, () => ({ reach: { x: s().x + 0.1, y: s().y - 0.7 }, grip: hold }));
    run(g, 1, () => ({ move: 1, reach: { x: s().x + 0.1, y: s().y - 0.7 }, grip: hold }));
    run(g, 0.8, { move: 1 });
    run(g, 0.7);
    const p = g.stanley.rig.pelvis.translation();
    expect(p.x).toBeGreaterThan(LEDGE.x0 + 0.3);
    expect(p.y).toBeGreaterThan(LEDGE.y + 0.7);
  });
});
