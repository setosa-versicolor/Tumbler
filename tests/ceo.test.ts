import { beforeAll, describe, expect, it } from "vitest";
import { DT, initPhysics } from "../src/physics/world";
import { Game, type GameEvent } from "../src/sim/game";
import { DEFAULT_TUNING } from "../src/sim/tuning";
import { IDLE_INTENT, type Intent } from "../src/physics/body/stanley";
import { dirtBike, trackY, type Bike } from "../src/levels/ceo/dirtBike";
import { golf, HOLES } from "../src/levels/ceo/golf";
import { CEO_LIFE } from "../src/levels/ceo";
import { levelById } from "../src/app/campaign";
import type { Prop } from "../src/levels/kit";

beforeAll(async () => {
  await initPhysics();
});

type Step = Partial<Intent> | ((t: number) => Partial<Intent>);
const run = (g: Game, secs: number, intent: Step = {}) => {
  const ev: GameEvent[] = [];
  const n = Math.round(secs / DT);
  for (let i = 0; i < n; i++) ev.push(...g.step({ ...IDLE_INTENT, ...(typeof intent === "function" ? intent(i * DT) : intent) }));
  return ev;
};
const texts = (ev: GameEvent[]) => ev.flatMap((e) => ("text" in e ? [e.text] : []));
const both = { L: true, R: true };

describe("CEO Life", () => {
  it("has the dirt bike and golf, findable by id, with no ratings", () => {
    expect(CEO_LIFE.map((l) => l.id)).toEqual(["ceo-dirt-bike", "ceo-golf"]);
    for (const l of CEO_LIFE) {
      expect(levelById(l.id)).toBe(l);
      expect(l.sandbox && l.ceo).toBe(true);
    }
  });
});

describe("Dirt bike", () => {
  const mount = () => {
    const g = new Game({ ...DEFAULT_TUNING, trippiness: 0 }, dirtBike);
    const bike = (g.inst as unknown as { bike: Bike }).bike;
    const bars = () => bike.bars.translation();
    run(g, 1);
    run(g, 1.4, { move: 0.5 });
    run(g, 1.5, () => ({ reach: bars(), grip: both }));
    return { g, bike, bars };
  };

  it("hands on the handlebars, Stanley gets on", () => {
    const { g } = mount();
    expect(g.stanley.seated).toBe(true);
  });

  it("on the gas, it goes; off the bars, it doesn't", () => {
    const { g, bike, bars } = mount();
    run(g, 3, () => ({ reach: bars(), grip: both, move: 1 }));
    expect(bike.chassis.translation().x).toBeGreaterThan(12);
    expect(g.stanley.seated).toBe(true);
    // Let go of the bars: no more gas.
    const a = mount();
    run(a.g, 3, { move: 1 });
    expect(a.bike.chassis.translation().x).toBeLessThan(6);
  });

  it("off the big kicker, leaning back: a backflip", () => {
    const { g, bike, bars } = mount();
    let phase = 0;
    const ev = run(g, 14, () => {
      const c = bike.chassis.translation();
      if (phase === 0 && c.x > 40.2) phase = 1;
      if (phase === 1 && c.x > 40.6) phase = 2;
      if (phase === 2 && c.y < trackY(c.x) + 0.7 && c.x > 44) phase = 3;
      return { reach: bars(), grip: both, move: phase === 0 || phase === 3 ? 1 : phase === 1 ? 0 : -1 };
    });
    expect(texts(ev)).toContain("BACKFLIP!");
  });

  it("upside down, he comes off", () => {
    const { g, bike } = mount();
    bike.chassis.setRotation(Math.PI, true);
    const ev = run(g, 1.5);
    expect(g.stanley.seated).toBe(false);
    expect(ev.some((e) => e.type === "ouch")).toBe(true);
  });

  it("round the course, it's a lap", () => {
    const { g, bike, bars } = mount();
    const ev = run(g, 14, () => ({ reach: bars(), grip: both, move: 1 }));
    expect(texts(ev)).toContain("LAP!");
    expect(bike.chassis.translation().x).toBeLessThan(80);
  });
});

describe("Golf", () => {
  const start = () => {
    const g = new Game({ ...DEFAULT_TUNING, trippiness: 0 }, golf);
    const inst = g.inst as unknown as { club: Prop; ball: Prop; hole: () => number; strokes: () => number };
    return { g, inst, club: inst.club.body, ball: inst.ball.body };
  };

  it("the club comes out of the bag, and a swing sends the ball down the fairway (a stroke)", () => {
    const { g, inst, club, ball } = start();
    const sh = () => g.stanley.shoulder;
    const gripAt = () => ({ x: club.translation().x, y: club.translation().y + 0.4 });
    run(g, 1);
    run(g, 0.5, { move: -0.4 });
    run(g, 1.2, () => ({ reach: gripAt() }));
    run(g, 0.6, () => ({ reach: gripAt(), grip: both }));
    expect(g.held.has(club)).toBe(true);
    run(g, 1.2, () => ({ reach: { x: sh().x + 0.3, y: sh().y + 0.4 }, grip: both, move: 0.3 }));
    run(g, 0.8, () => ({ reach: { x: sh().x - 0.6, y: sh().y + 0.5 }, grip: both }));
    run(g, 0.35, (t) => {
      const a = Math.PI * 0.8 - (t / 0.35) * Math.PI * 1.3;
      return { reach: { x: sh().x + Math.cos(a) * 0.8, y: sh().y + Math.sin(a) * 0.8 - 0.3 }, grip: both };
    });
    run(g, 4, { grip: both });
    expect(inst.strokes()).toBeGreaterThanOrEqual(1);
    expect(ball.translation().x - HOLES[0].tee).toBeGreaterThan(10);
  });

  it("in the cup: the hole's called, then on to the next tee", () => {
    const { g, inst, ball } = start();
    run(g, 0.5);
    const h = HOLES[0];
    ball.setTranslation({ x: h.cup - 0.4, y: 0.3 }, true);
    ball.setLinvel({ x: 1.2, y: 0 }, true);
    const ev = run(g, 3);
    expect(texts(ev).some((t) => /HOLE IN ONE|Birdie|Par|Bogey|EAGLE|\+/.test(t))).toBe(true);
    expect(inst.hole()).toBe(1);
    expect(Math.abs(ball.translation().x - HOLES[1].tee)).toBeLessThan(0.2);
    expect(Math.abs(g.stanley.rig.pelvis.translation().x - HOLES[1].tee)).toBeLessThan(2);
  });

  it("when the ball stops a long way off, the caddie cart takes Stanley to it", () => {
    const { g, ball } = start();
    run(g, 0.5);
    ball.setTranslation({ x: 19, y: 0.1 }, true);
    const ev = run(g, 3);
    expect(texts(ev)).toContain("Caddie!");
    expect(Math.abs(g.stanley.rig.pelvis.translation().x - 19)).toBeLessThan(1.5);
  });

  it("off the end of the course: out of bounds, a drop and a stroke", () => {
    const { g, inst, ball } = start();
    run(g, 1);
    ball.setTranslation({ x: 0.1, y: 0.5 }, true);
    ball.setLinvel({ x: -2, y: 0 }, true);
    const ev = run(g, 0.5);
    expect(texts(ev)).toContain("Out of bounds. +1");
    expect(inst.strokes()).toBe(1);
    expect(ball.translation().x).toBeGreaterThan(1);
  });
});
