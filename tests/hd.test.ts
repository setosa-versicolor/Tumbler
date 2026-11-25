import { beforeAll, describe, expect, it } from "vitest";
import { DT, initPhysics } from "../src/physics/world";
import { Game, type GameEvent } from "../src/sim/game";
import { DEFAULT_TUNING } from "../src/sim/tuning";
import { IDLE_INTENT } from "../src/physics/body/stanley";
import { coffeeRunHD, DNP } from "../src/hd/coffeeRunHD";
import { coffeeRun } from "../src/levels/downtown/coffeeRun";

beforeAll(async () => {
  await initPhysics();
});

const run = (g: Game, seconds: number, push = false) => {
  const events: GameEvent[] = [];
  const button = g.buttons.find((b) => b.style === "custom")!;
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    // Shove the cap into the left wall.
    if (push) button.cap.setLinvel({ x: -2, y: 0 }, true);
    events.push(...g.step(IDLE_INTENT));
  }
  return events;
};

describe("Coffee Run HD", () => {
  it("is the same job, with the same id, and a button on the left wall", () => {
    expect(coffeeRunHD.id).toBe(coffeeRun.id);
    const g = new Game(DEFAULT_TUNING, coffeeRunHD);
    const b = g.buttons.find((b) => b.style === "custom")!;
    expect(b).toBeTruthy();
    const p = b.cap.translation();
    expect(p.x).toBeGreaterThan(0);
    expect(p.x).toBeLessThan(0.2);
    expect(p.y).toBeCloseTo(DNP.y, 2);
    expect(g.progress.done).toBe(false);
  });

  it("stays put if nobody touches it", () => {
    const g = new Game(DEFAULT_TUNING, coffeeRunHD);
    const ev = run(g, 2);
    expect(g.buttons.find((b) => b.style === "custom")!.presses).toBe(0);
    expect(ev.some((e) => e.type === "surprise")).toBe(false);
  });

  it("pushing it sets off the alarm, then the party; pushing again ends it", () => {
    const g = new Game(DEFAULT_TUNING, coffeeRunHD);
    let ev = run(g, 0.3, true);
    // Still pushing during the alarm: no difference.
    ev.push(...run(g, 0.6, true));
    expect(ev.filter((e) => e.type === "surprise").length).toBe(1);
    expect(ev.some((e) => e.type === "press")).toBe(true);
    expect(ev.some((e) => e.type === "sfx" && e.name === "alarm")).toBe(true);
    expect(ev.find((e) => e.type === "surprise")).toMatchObject({ text: "It said DO NOT PUSH." });
    ev = run(g, 3);
    expect(ev.filter((e) => e.type === "sfx" && e.name.startsWith("beat")).length).toBeGreaterThan(2);
    const scene = g.inst.hd!(g, g.time);
    expect(scene.lights.filter((l) => l.spot && l.shadow).length).toBe(4);
    ev = run(g, 0.3, true);
    expect(ev.find((e) => e.type === "surprise")).toMatchObject({ text: "Fine. Back to work." });
    run(g, 2);
    const after = g.inst.hd!(g, g.time);
    expect(after.lights.filter((l) => l.shadow).length).toBe(4);
    expect(after.lights.every((l) => !l.spot || l.spot.outer > 0.5)).toBe(true);
  });
});
