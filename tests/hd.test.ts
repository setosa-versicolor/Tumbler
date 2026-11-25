import { beforeAll, describe, expect, it } from "vitest";
import { DT, initPhysics } from "../src/physics/world";
import { Game, type GameEvent } from "../src/sim/game";
import { DEFAULT_TUNING } from "../src/sim/tuning";
import { IDLE_INTENT } from "../src/physics/body/stanley";
import { coffeeRunHD, DNP } from "../src/hd/coffeeRunHD";
import { coffeeRun } from "../src/levels/downtown/coffeeRun";
import { CUP_FILL, SLICK, type Liquid } from "../src/levels/liquid";

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

describe("Spilled coffee", () => {
  const cups = (g: Game) => g.props.filter((p) => p.kind === "cup");
  const liquid = (g: Game) => (g.inst as unknown as { coffee: Liquid }).coffee;

  it("stays in the cups while nobody touches them", () => {
    const g = new Game(DEFAULT_TUNING, coffeeRunHD);
    run(g, 2);
    expect(liquid(g).drops.length).toBe(0);
    expect(liquid(g).puddles.length).toBe(0);
    for (const c of cups(g)) expect(liquid(g).fillOf(c.body)).toBe(1);
  });

  it("pours out of a cup that tips", () => {
    const g = new Game(DEFAULT_TUNING, coffeeRunHD);
    run(g, 0.6);
    const cup = cups(g)[0];
    let poured = 0;
    for (let i = 0; i < 0.3 / DT; i++) {
      // Held tipped over (but not so far it breaks).
      cup.body.setRotation(0.75, true);
      cup.body.setAngvel(0, true);
      g.step(IDLE_INTENT);
      poured = Math.max(poured, liquid(g).drops.length);
    }
    expect(poured).toBeGreaterThan(5);
    expect(liquid(g).fillOf(cup.body)!).toBeLessThan(1);
  });

  it("a broken cup spills everything, and it ends up in a puddle", () => {
    const g = new Game(DEFAULT_TUNING, coffeeRunHD);
    run(g, 0.6);
    const cup = cups(g)[0];
    // Lifted clear of the tray, then dropped on its side.
    cup.body.setTranslation({ x: 5.5, y: 1.5 }, true);
    cup.body.setLinvel({ x: 0, y: 0 }, true);
    g.step(IDLE_INTENT);
    cup.body.setRotation(1.4, true);
    run(g, 0.05);
    expect(cups(g)).not.toContain(cup);
    expect(liquid(g).drops.length).toBeGreaterThan(CUP_FILL * 0.8);
    run(g, 4);
    expect(liquid(g).drops.length).toBe(0);
    const floor = liquid(g).puddles.filter((p) => p.y === 0);
    expect(floor.length).toBeGreaterThan(0);
    const w = floor.reduce((s, p) => s + p.w * 2, 0);
    expect(w).toBeGreaterThan(0.2);
    expect(w).toBeLessThan(1.2);
  });

  it("a puddle on the floor is slick: running into it, Stanley goes over", () => {
    const g = new Game(DEFAULT_TUNING, coffeeRunHD);
    const x = coffeeRunHD.spawn.x + 1.6;
    liquid(g).puddles.push({ x, y: 0, w: 0.35, target: 0.35, x0: -1, x1: 15 });
    const events: GameEvent[] = [];
    let slick = false;
    for (let i = 0; i < 2.5 / DT; i++) {
      events.push(...g.step({ ...IDLE_INTENT, move: 1 }));
      if (liquid(g).slick) {
        slick = true;
        expect(g.tuning.traction).toBeCloseTo(DEFAULT_TUNING.traction * SLICK);
      }
    }
    expect(slick).toBe(true);
    expect(events.some((e) => e.type === "ouch" && e.text === "SLIPPED!")).toBe(true);
    // Out of it, the grip comes back.
    run(g, 2);
    if (!liquid(g).slick) expect(g.tuning.traction).toBe(DEFAULT_TUNING.traction);
  });
});
