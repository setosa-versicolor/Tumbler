import { beforeAll, describe, expect, it } from "vitest";
import { DT, initPhysics } from "../src/physics/world";
import { Game, type GameEvent } from "../src/sim/game";
import { DEFAULT_TUNING } from "../src/sim/tuning";
import { IDLE_INTENT, type Intent } from "../src/physics/body/stanley";
import { dirtBike, trackY, type Bike } from "../src/levels/ceo/dirtBike";
import { golf, HOLES } from "../src/levels/ceo/golf";
import { jet, GLASS_FULL } from "../src/levels/ceo/jet";
import { yacht, DECK } from "../src/levels/ceo/yacht";
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
  it("has the dirt bike, golf, the jet and the yacht, findable by id, with no ratings", () => {
    expect(CEO_LIFE.map((l) => l.id)).toEqual(["ceo-dirt-bike", "ceo-golf", "ceo-jet", "ceo-yacht"]);
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
    expect(texts(ev).some((t) => t.endsWith("BACKFLIP!"))).toBe(true);
  });

  it("upside down, he comes off", () => {
    const { g, bike } = mount();
    bike.chassis.setRotation(Math.PI, true);
    const ev = run(g, 1.5);
    expect(g.stanley.seated).toBe(false);
    expect(ev.some((e) => e.type === "ouch")).toBe(true);
  });

  it("round the course, over the mountain and the mega kicker (massive air), it's a lap", () => {
    const { g, bike, bars } = mount();
    let top = 0;
    const ev = run(g, 18, () => {
      const c = bike.chassis.translation();
      if (c.x > 113.6 && c.x < 130) top = Math.max(top, c.y - trackY(c.x));
      return { reach: bars(), grip: both, move: 1 };
    });
    expect(texts(ev).some((t) => t.startsWith("MASSIVE AIR!"))).toBe(true);
    expect(top).toBeGreaterThan(4.5);
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

describe("Jet", () => {
  type Glass = { prop: Prop; fill: number };
  const start = () => {
    const g = new Game({ ...DEFAULT_TUNING, trippiness: 0 }, jet);
    const inst = g.inst as unknown as { bottle: Prop; glasses: Glass[]; phase: () => string; poured: () => number };
    return { g, inst, bottle: inst.bottle.body };
  };
  const R = { L: false, R: true };
  const takeBottle = (g: Game, bottle: Prop["body"]) => {
    run(g, 1);
    run(g, 0.8, { move: -0.5 });
    run(g, 1, () => ({ reach: bottle.translation(), grip: R }));
    run(g, 2.5, { move: 0.6, grip: R, reach: { x: g.stanley.shoulder.x + 0.4, y: g.stanley.shoulder.y + 0.2 } });
  };

  it("off the ice and tipped over a flute, the champagne fills it: a toast", () => {
    const { g, inst, bottle } = start();
    takeBottle(g, bottle);
    expect(g.held.has(bottle)).toBe(true);
    const ev = run(g, 2, { grip: R, reach: { x: 5.8, y: 0.9 } });
    expect(inst.glasses[0].fill).toBeGreaterThanOrEqual(GLASS_FULL - 1);
    expect(inst.poured()).toBe(1);
    expect(texts(ev).some((t) => /Cheers|To |Bubbly|Lovely/.test(t))).toBe(true);
  });

  it("every so often: the seatbelt sign, then turbulence that shakes the cabin", () => {
    const { g, inst } = start();
    const phases = new Set<string>();
    const ev: GameEvent[] = [];
    for (let i = 0; i < 16 / 0.1; i++) {
      ev.push(...run(g, 0.1));
      phases.add(inst.phase());
    }
    expect([...phases]).toEqual(expect.arrayContaining(["calm", "warning", "bumpy"]));
    expect(ev.some((e) => e.type === "shake")).toBe(true);
    expect(ev.some((e) => e.type === "sfx" && e.name === "alarm")).toBe(true);
  });

  it("dropped on the floor, the steward puts the bottle back on ice", () => {
    const { g, bottle } = start();
    run(g, 0.5);
    bottle.setTranslation({ x: 4, y: 0.1 }, true);
    bottle.setRotation(Math.PI / 2, true);
    run(g, 3.5);
    expect(Math.abs(bottle.translation().x - 1.55)).toBeLessThan(0.1);
    expect(bottle.translation().y).toBeGreaterThan(1);
  });
});

describe("Yacht", () => {
  const start = () => {
    const g = new Game({ ...DEFAULT_TUNING, trippiness: 0 }, yacht);
    const inst = g.inst as unknown as { rod: Prop; state: () => string; fish: () => Prop | null; caught: () => number };
    const rod = inst.rod.body;
    run(g, 1);
    run(g, 1.2, { move: 0.5 });
    run(g, 1.2, () => ({ reach: { x: rod.translation().x, y: rod.translation().y - 0.5 }, grip: both }));
    return { g, inst, rod };
  };
  const fight = (g: Game, inst: { state: () => string }) => () => ({
    grip: both,
    move: inst.state() === "fight" && g.stanley.position.x > 6.5 ? -0.5 : 0,
    reach: { x: g.stanley.shoulder.x - 0.4, y: g.stanley.shoulder.y + 0.5 },
  });

  it("rod in hand, something bites; reel it in to the stern and it's landed", () => {
    const { g, inst, rod } = start();
    expect(g.held.has(rod)).toBe(true);
    let ev = run(g, 9, fight(g, inst));
    expect(texts(ev)).toContain("FISH ON!");
    ev = run(g, 50, () => (inst.caught() ? { grip: both } : fight(g, inst)()));
    expect(texts(ev).some((t) => t.startsWith("LANDED!"))).toBe(true);
    expect(inst.caught()).toBe(1);
  });

  it("let go of the rod mid-fight and it gets away", () => {
    const { g, inst } = start();
    run(g, 9, fight(g, inst));
    expect(inst.state()).toBe("fight");
    const ev = run(g, 0.5);
    expect(texts(ev)).toContain("It got away.");
    expect(inst.fish()).toBeNull();
  });

  it("too much strain for too long: the line snaps", () => {
    const { g, inst } = start();
    run(g, 9, fight(g, inst));
    const fish = inst.fish()!;
    const ev = run(g, 1.5, () => {
      if (inst.fish()) fish.body.setLinvel({ x: 9, y: 0 }, true);
      return fight(g, inst)();
    });
    expect(texts(ev)).toContain("SNAP!");
    expect(inst.state()).toBe("gone");
  });

  it("dragged over the stern: man overboard, and the fish gets away", () => {
    const { g, inst } = start();
    run(g, 9, fight(g, inst));
    g.stanley.teleport({ x: DECK.stern + 1.5, y: 1 });
    const ev = run(g, 1, { grip: both });
    expect(texts(ev).some((t) => /overboard|got away/.test(t))).toBe(true);
    expect(inst.fish()).toBeNull();
  });
});
