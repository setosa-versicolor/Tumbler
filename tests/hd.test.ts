import { beforeAll, describe, expect, it } from "vitest";
import { DT, initPhysics } from "../src/physics/world";
import { Game, type GameEvent } from "../src/sim/game";
import { DEFAULT_TUNING } from "../src/sim/tuning";
import { IDLE_INTENT } from "../src/physics/body/stanley";
import { coffeeRunHD, DNP } from "../src/hd/coffeeRunHD";
import { coffeeRun } from "../src/levels/downtown/coffeeRun";
import { CHAPTERS } from "../src/app/campaign";
import { twistFor } from "../src/levels/twists";
import { FD_BUTTON, fireDrillHD, SPRINKLE_TIME } from "../src/hd/fireDrillHD";
import { fireDrill } from "../src/levels/skyscraper/fireDrill";
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
  it("is the Coffee Run in the game", () => {
    expect(CHAPTERS.flatMap((c) => c.levels)).toContain(coffeeRunHD);
  });

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

  it("in plain graphics, pushing it turns the graphics up (once, however hard you flail at it)", () => {
    const g = new Game(DEFAULT_TUNING, coffeeRunHD);
    let ev = run(g, 0.3, true);
    expect(ev.filter((e) => e.type === "graphics")).toEqual([{ type: "graphics", to: "hd" }]);
    expect(ev.find((e) => e.type === "surprise")).toMatchObject({ text: "It said DO NOT PUSH." });
    expect(ev.some((e) => e.type === "sfx" && e.name === "alarm")).toBe(false);
    // The app turns them up; still pushing while they come up does nothing more.
    g.hd = true;
    ev = run(g, 1.5, true);
    expect(ev.some((e) => e.type === "graphics" || e.type === "surprise" || (e.type === "sfx" && e.name === "alarm"))).toBe(false);
    // The lamps come on one by one as the graphics turn up.
    run(g, 2);
    expect(g.inst.hd!(g, g.time).lights.filter((l) => l.shadow).length).toBe(4);
    // Pushed again, now in HD: the party.
    ev = run(g, 0.3, true);
    expect(ev.some((e) => e.type === "sfx" && e.name === "alarm")).toBe(true);
    expect(ev.some((e) => e.type === "graphics")).toBe(false);
  });

  it("in HD, pushing it sets off the alarm, then the party; pushing again ends it", () => {
    const g = new Game(DEFAULT_TUNING, coffeeRunHD);
    g.hd = true;
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

describe("Coffee Run's lamp", () => {
  /** Stanley has just carried the lamp over and let go of it here (upright unless `tilt`), `drop` metres above `surface`. */
  const setDown = (g: Game, x: number, surface: number, opts: { drop?: number; tilt?: number } = {}) => {
    const lamp = g.props.find((p) => p.kind === "lamp")!;
    (g as unknown as { fragile: Map<unknown, { carried: boolean; timer: number }> }).fragile.set(lamp.body, { carried: true, timer: 0 });
    lamp.body.setTranslation({ x, y: surface + lamp.hh + 0.005 + (opts.drop ?? 0) }, true);
    lamp.body.setRotation(opts.tilt ?? 0, true);
    lamp.body.setLinvel({ x: 0, y: 0 }, true);
    lamp.body.setAngvel(0, true);
    return lamp;
  };

  for (const [where, x, y] of [
    ["on Reception's desk", 12.4, 0.78],
    ["on the kitchen counter", 1.0, 0.95],
    ["on the floor out of the way", 4.0, 0],
  ] as const) {
    it(`survives being set down gently ${where}`, () => {
      const g = new Game(DEFAULT_TUNING, coffeeRunHD);
      run(g, 0.7);
      const lamp = setDown(g, x, y);
      run(g, 2);
      expect(g.props).toContain(lamp);
      expect(g.breaks).toBe(0);
    });
  }

  it("still breaks if it's dropped onto the desk", () => {
    const g = new Game(DEFAULT_TUNING, coffeeRunHD);
    run(g, 0.7);
    const lamp = setDown(g, 12.4, 0.78, { drop: 0.7 });
    run(g, 2);
    expect(g.props).not.toContain(lamp);
    expect(g.breaks).toBe(1);
  });

  it("still breaks if it's put down leaning and topples", () => {
    const g = new Game(DEFAULT_TUNING, coffeeRunHD);
    run(g, 0.7);
    const lamp = setDown(g, 4.0, 0, { tilt: 0.7 });
    run(g, 3);
    expect(g.props).not.toContain(lamp);
    expect(g.breaks).toBe(1);
  });

  it("can be moved safely in Overtime too (so ★5 is possible)", () => {
    const g = new Game(DEFAULT_TUNING, coffeeRunHD, 1, twistFor(coffeeRunHD.id));
    run(g, 0.7);
    const lamp = setDown(g, 12.4, 0.78);
    run(g, 3);
    expect(g.props).toContain(lamp);
    expect(g.breaks).toBe(0);
  });
});

describe("Fire Drill HD", () => {
  const button = (g: Game) => g.buttons.find((b) => b.style === "custom")!;
  const step = (g: Game, secs: number, intent: Partial<typeof IDLE_INTENT> | ((t: number) => Partial<typeof IDLE_INTENT>) = {}) => {
    const events: GameEvent[] = [];
    for (let i = 0; i < Math.round(secs / DT); i++) events.push(...g.step({ ...IDLE_INTENT, ...(typeof intent === "function" ? intent(i * DT) : intent) }));
    return events;
  };

  it("is the Fire Drill in the game, with the button high on the left wall", () => {
    expect(CHAPTERS.flatMap((c) => c.levels)).toContain(fireDrillHD);
    expect(fireDrillHD.id).toBe(fireDrill.id);
    const g = new Game(DEFAULT_TUNING, fireDrillHD);
    const p = button(g).cap.translation();
    expect(p.x).toBeLessThan(0.25);
    expect(p.y).toBeCloseTo(FD_BUTTON.y, 2);
  });

  it("is out of reach standing on the floor", () => {
    const g = new Game({ ...DEFAULT_TUNING, trippiness: 0 }, fireDrillHD);
    step(g, 0.5);
    step(g, 2, { move: -0.4 });
    const ev = step(g, 3, () => ({ reach: { x: 0.05, y: FD_BUTTON.y }, grip: { L: false, R: false } }));
    expect(button(g).presses).toBe(0);
    expect(ev.some((e) => e.type === "graphics")).toBe(false);
  });

  it("can be reached with a jump", () => {
    const g = new Game({ ...DEFAULT_TUNING, trippiness: 0 }, fireDrillHD);
    step(g, 0.5);
    step(g, 2, { move: -0.4 });
    const ev: GameEvent[] = [];
    for (let k = 0; k < 4 && !ev.some((e) => e.type === "graphics"); k++) {
      ev.push(...step(g, 1 / 120, { reach: { x: 0.05, y: FD_BUTTON.y + 0.3 }, jump: true }));
      ev.push(...step(g, 1.2, { reach: { x: 0.05, y: FD_BUTTON.y + 0.3 } }));
    }
    expect(ev.some((e) => e.type === "graphics")).toBe(true);
  });

  it("can be hit with a thrown mannequin", () => {
    const g = new Game(DEFAULT_TUNING, fireDrillHD);
    step(g, 0.6);
    const dummy = g.props.find((p) => p.kind === "dummy")!;
    dummy.body.setTranslation({ x: 1.0, y: FD_BUTTON.y - 0.1 }, true);
    dummy.body.setLinvel({ x: -6, y: 1 }, true);
    const ev = step(g, 0.5);
    expect(ev.some((e) => e.type === "graphics")).toBe(true);
  });

  it("in HD, it sets off the sprinklers, which knock the fire down (it smoulders, and comes back)", () => {
    const g = new Game(DEFAULT_TUNING, fireDrillHD);
    g.hd = true;
    step(g, 0.6);
    // Knock the heater over: it's a fire.
    const heater = g.props.find((p) => p.kind === "heater")!;
    heater.body.setLinvel({ x: 1.5, y: 0 }, true);
    step(g, 2);
    const inst = g.inst as unknown as { fire: { cells: { heat: number }[] }; water: Liquid };
    const heat = () => inst.fire.cells.reduce((s, c) => s + c.heat, 0);
    expect(heat()).toBeGreaterThan(0);
    // Smack the button.
    const b = button(g);
    for (let i = 0; i < 30; i++) {
      b.cap.setLinvel({ x: -2, y: 0 }, true);
      g.step(IDLE_INTENT);
    }
    const ev = step(g, SPRINKLE_TIME);
    expect(inst.water.puddles.length + inst.water.drops.length).toBeGreaterThan(0);
    expect(heat()).toBe(0);
    expect(ev.some((e) => e.type === "score" && e.text.startsWith("Fire's out"))).toBe(true);
  });
});
