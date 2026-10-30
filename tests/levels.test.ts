import { beforeAll, describe, expect, it } from "vitest";
import { initPhysics } from "../src/physics/world";
import { Game } from "../src/sim/game";
import { DEFAULT_TUNING } from "../src/sim/tuning";
import { IDLE_INTENT, type Intent } from "../src/physics/body/stanley";
import { ALL_LEVELS } from "../src/app/campaign";
import { dingDong } from "../src/levels/suburb/dingDong";
import { laundryDay } from "../src/levels/suburb/laundryDay";
import { stackIt } from "../src/levels/suburb/stackIt";
import { pizzaUp } from "../src/levels/suburb/pizzaUp";
import { office } from "../src/story/office";
import { dayOff } from "../src/levels/dayOff";
import { Cutscene } from "../src/story/cutscene";
import { ONBOARDING, REVIEW_1, REVIEW_2 } from "../src/story/scripts";
import { crateExpectations } from "../src/levels/docks/crateExpectations";
import { fishToss } from "../src/levels/docks/fishToss";
import { rollOut } from "../src/levels/docks/rollOut";
import { crowsNest } from "../src/levels/docks/crowsNest";
import type { GameEvent } from "../src/sim/game";
import type { Level } from "../src/levels/level";

beforeAll(() => initPhysics());

const play = (level: Level) => new Game({ ...DEFAULT_TUNING }, level);
const run = (g: Game, seconds: number, intent: Partial<Intent> | ((t: number) => Partial<Intent>) = {}) => {
  const steps = Math.round(seconds * 120);
  for (let i = 0; i < steps; i++) g.step({ ...IDLE_INTENT, ...(typeof intent === "function" ? intent(i / 120) : intent) });
};

describe("every level", () => {
  for (const level of [...ALL_LEVELS, office]) {
    it(`${level.id}: Stanley spawns standing and stays put`, () => {
      const g = play(level);
      run(g, 3);
      expect(g.stanley.balance.posture).toBe("up");
      const p = g.stanley.rig.pelvis.translation();
      expect(p.y - level.spawn.y).toBeGreaterThan(0.75);
      expect(p.y - level.spawn.y).toBeLessThan(1.1);
      expect(g.progress.done).toBe(false);
      expect(g.doneAt).toBeNull();
    });
  }
});

describe("Ding Dong", () => {
  it("is done when Stanley jumps up and punches the bell", () => {
    const g = play(dingDong);
    // Walk onto the porch.
    run(g, 4, () => ({ move: g.stanley.rig.pelvis.translation().x < 10.85 ? 1 : 0 }));
    const bell = { x: 11.5, y: 2.25 };
    for (let attempt = 0; attempt < 4 && !g.progress.done; attempt++) {
      run(g, 1.2, (t) => ({ move: 1, jump: t === 0, reach: { x: bell.x + 0.3, y: bell.y } }));
    }
    expect(g.progress.done).toBe(true);
    expect(g.doneAt).not.toBeNull();
  });
});

describe("Laundry Day", () => {
  it("counts socks in the basket", () => {
    const g = play(laundryDay);
    const socks = g.props.filter((p) => p.kind === "sock");
    socks.slice(0, 2).forEach((s, i) => s.body.setTranslation({ x: 9.9 + i * 0.4, y: 1.6 }, true));
    run(g, 1);
    expect(g.progress).toEqual({ done: false, label: "Socks 2/3" });
    socks[2].body.setTranslation({ x: 10.2, y: 1.8 }, true);
    run(g, 1);
    expect(g.progress.done).toBe(true);
  });

  it("Stanley can pick a sock up off the floor without falling over", () => {
    const g = play(laundryDay);
    const sock = g.props.filter((p) => p.kind === "sock").find((p) => p.body.translation().x > 2.5 && p.body.translation().y < 0.2)!.body;
    run(g, 2, () => ({ move: g.stanley.rig.pelvis.translation().x < sock.translation().x - 0.65 ? 1 : 0 }));
    run(g, 1.5, () => ({ reach: sock.translation(), grip: { L: true, R: true } }));
    expect(g.held.has(sock)).toBe(true);
    const s = () => g.stanley.shoulder;
    run(g, 1.5, () => ({ reach: { x: s().x + 0.3, y: s().y + 0.4 }, grip: { L: true, R: true } }));
    expect(sock.translation().y).toBeGreaterThan(1.4);
    expect(g.falls).toBe(0);
  });

  it("hands never grab the floor", () => {
    const g = play(laundryDay);
    const p = g.stanley.rig.pelvis.translation();
    run(g, 2, { reach: { x: p.x - 0.5, y: 0 }, grip: { L: true, R: true } });
    expect(g.stanley.grips.L.held).toBeNull();
    expect(g.stanley.grips.R.held).toBeNull();
    expect(g.stanley.balance.posture).toBe("up");
  });

  it("a thrown sock can reach the basket", () => {
    const g = play(laundryDay);
    const sock = g.props.find((p) => p.kind === "sock")!.body;
    sock.setTranslation({ x: 7, y: 1.6 }, true);
    sock.setLinvel({ x: 4.2, y: 4 }, true);
    run(g, 1.5);
    expect(g.progress.label).toBe("Socks 1/3");
  });
});

describe("Stack It", () => {
  it("needs the stack to reach the line and stay there", () => {
    const g = play(stackIt);
    const boxes = g.props.filter((p) => p.kind === "box").sort((a, b) => b.hw - a.hw);
    let y = 0;
    for (const b of boxes.slice(0, 3)) {
      b.body.setTranslation({ x: 8, y: y + b.hh + 0.01 }, true);
      b.body.setRotation(0, true);
      b.body.setLinvel({ x: 0, y: 0 }, true);
      y += b.hh * 2 + 0.01;
    }
    run(g, 0.8);
    expect(g.progress.done).toBe(false);
    expect(g.progress.label).toMatch(/Hold it/);
    run(g, 1.5);
    expect(g.progress.done).toBe(true);
  });
});

describe("Pizza Up", () => {
  it("Stanley can walk up the stairs without tripping", () => {
    const g = play(pizzaUp);
    // Hop the table, then a careful pace (below tripping speed) up the stairs.
    let hopped = false;
    run(g, 7, () => {
      const x = g.stanley.rig.pelvis.translation().x;
      const jump = !hopped && x > 2.05;
      if (jump) hopped = true;
      return { move: 0.55, jump };
    });
    const p = g.stanley.rig.pelvis.translation();
    expect(p.x).toBeGreaterThan(9);
    expect(p.y).toBeGreaterThan(2.7);
    expect(g.stanley.balance.posture).toBe("up");
  });

  it("wants the pizza flat on the mat", () => {
    const g = play(pizzaUp);
    const pizza = g.props.find((p) => p.kind === "pizza")!.body;
    pizza.setTranslation({ x: 12.2, y: 2.1 }, true);
    pizza.setRotation(Math.PI, true);
    run(g, 1.5);
    expect(g.progress.label).toBe("Flat, please!");
    pizza.setRotation(0, true);
    pizza.setTranslation({ x: 12.2, y: 2.1 }, true);
    run(g, 1.5);
    expect(g.progress.done).toBe(true);
  });

  it("a dropped pizza lands on the steps (they're solid to props)", () => {
    const g = play(pizzaUp);
    const pizza = g.props.find((p) => p.kind === "pizza")!.body;
    pizza.setTranslation({ x: 5.75, y: 1.0 }, true);
    run(g, 1.5);
    expect(pizza.translation().y).toBeGreaterThan(0.5);
    expect(pizza.translation().y).toBeLessThan(0.8);
  });
});

describe("Cutscenes", () => {
  for (const script of [ONBOARDING, REVIEW_1, REVIEW_2]) {
    it(`${script.id} plays through to the end with Stanley back at the door`, () => {
      const g = play(office);
      const scene = new Cutscene(script, g);
      let t = 0;
      while (!scene.done && t < 120) {
        const intent = scene.update(1 / 60);
        g.step(intent);
        g.step(intent);
        t += 1 / 60;
      }
      expect(scene.done).toBe(true);
      expect(g.stanley.rig.pelvis.translation().x).toBeLessThan(1.2);
    });
  }

  it("tapping skips through lines", () => {
    const g = play(office);
    const scene = new Cutscene(ONBOARDING, g);
    for (let i = 0; i < 200 && !scene.done; i++) {
      for (let k = 0; k < 30; k++) g.step(scene.update(1 / 120));
      scene.advance();
    }
    expect(scene.done).toBe(true);
  });
});

describe("Breakables", () => {
  const fragiles = (g: Game) => g.props.filter((p) => p.fragile);

  it("every job has something breakable in the way", () => {
    for (const level of ALL_LEVELS) expect(fragiles(play(level)).length, level.id).toBeGreaterThan(0);
  });

  it("running into one knocks it over and smashes it", () => {
    const g = play(dingDong);
    run(g, 3.5, { move: 1 });
    expect(g.breaks).toBe(1);
    expect(fragiles(g)).toHaveLength(0);
    expect(g.props.filter((p) => p.kind === "shard").length).toBeGreaterThan(3);
  });

  it("standing on one breaks it", () => {
    const g = play(dayOff);
    const vase = fragiles(g)[0].body;
    const top = vase.translation().y + 0.42;
    for (const b of g.stanley.rig.bodies) {
      const p = b.translation();
      b.setTranslation({ x: p.x - 2.5 + vase.translation().x, y: p.y + top + 0.05 }, true);
    }
    run(g, 1);
    expect(g.breaks).toBe(1);
  });

  it("picking one up and putting it down breaks it anyway", () => {
    const g = play(dayOff);
    const vase = fragiles(g)[0].body;
    run(g, 0.6);
    const p = g.stanley.rig.pelvis.translation();
    vase.setTranslation({ x: p.x + 0.55, y: 0.43 }, true);
    run(g, 1.5, () => ({ reach: vase.translation(), grip: { L: true, R: true } }));
    expect(g.held.has(vase)).toBe(true);
    expect(g.breaks).toBe(0);
    run(g, 1, () => ({ reach: { x: g.stanley.shoulder.x + 0.6, y: 0.5 }, grip: { L: true, R: true } }));
    run(g, 1.5);
    expect(g.breaks).toBe(1);
    expect(g.stanley.grips.L.held).toBeNull();
    expect(g.stanley.grips.R.held).toBeNull();
  });
});

describe("Tripping", () => {
  const sprintThroughSocks = (move: number, seed: number, trippiness = 1) => {
    const g = new Game({ ...DEFAULT_TUNING, trippiness }, laundryDay, seed);
    let trips = 0;
    for (let i = 0; i < 120 * 2.6; i++) for (const e of g.step({ ...IDLE_INTENT, move })) if (e.type === "trip") trips++;
    return { trips, falls: g.falls };
  };

  it("sprinting over socks trips Stanley up", () => {
    const total = [1, 2, 3, 4].reduce((n, seed) => n + sprintThroughSocks(1, seed).trips, 0);
    expect(total).toBeGreaterThanOrEqual(2);
  });

  it("walking over the same socks is safe", () => {
    for (const seed of [1, 2, 3, 4]) expect(sprintThroughSocks(0.55, seed)).toEqual({ trips: 0, falls: 0 });
  });

  it("trippiness 0 turns it off", () => {
    for (const seed of [1, 2, 3, 4]) expect(sprintThroughSocks(1, seed, 0).trips).toBe(0);
  });
});

describe("Stairs", () => {
  const climb = (move: number, seed: number) => {
    const g = new Game({ ...DEFAULT_TUNING }, pizzaUp, seed);
    // Start at the foot of the stairs, past the table.
    for (const b of g.stanley.rig.bodies) {
      const p = b.translation();
      b.setTranslation({ x: p.x + 2.8, y: p.y }, true);
    }
    let trips = 0;
    for (let i = 0; i < 120 * 3.5; i++) for (const e of g.step({ ...IDLE_INTENT, move })) if (e.type === "trip") trips++;
    return trips;
  };

  it("sprinting up the stairs usually ends in a trip", () => {
    const tripped = [1, 2, 3, 4, 5, 6].filter((seed) => climb(1, seed) > 0).length;
    expect(tripped).toBeGreaterThanOrEqual(4);
  });

  it("walking up the stairs is safe", () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) expect(climb(0.55, seed)).toBe(0);
  });
});

const collect = (g: Game, seconds: number, intent: Partial<Intent> | ((t: number) => Partial<Intent>) = {}) => {
  const out: GameEvent[] = [];
  const steps = Math.round(seconds * 120);
  for (let i = 0; i < steps; i++) out.push(...g.step({ ...IDLE_INTENT, ...(typeof intent === "function" ? intent(i / 120) : intent) }));
  return out;
};
const moveStanley = (g: Game, dx: number, dy: number) => {
  for (const b of g.stanley.rig.bodies) {
    const p = b.translation();
    b.setTranslation({ x: p.x + dx, y: p.y + dy }, true);
  }
};

describe("Crate Expectations", () => {
  it("is done with three crates on deck", () => {
    const g = play(crateExpectations);
    g.props.filter((p) => p.kind === "crate").forEach((c, i) => c.body.setTranslation({ x: 12 + i * 0.8, y: 1.7 }, true));
    run(g, 1.5);
    expect(g.progress.done).toBe(true);
  });

  it("falling in the water is a splash and a trip back to the start", () => {
    const g = play(crateExpectations);
    moveStanley(g, 8.5, 0.5);
    const ev = collect(g, 2);
    expect(ev.some((e) => e.type === "splash" && e.big)).toBe(true);
    expect(g.falls).toBe(1);
    expect(Math.abs(g.stanley.rig.pelvis.translation().x - crateExpectations.spawn.x)).toBeLessThan(0.6);
  });

  it("crates float", () => {
    const g = play(crateExpectations);
    const crate = g.props.find((p) => p.kind === "crate")!.body;
    crate.setTranslation({ x: 10, y: 2 }, true);
    run(g, 3);
    expect(crate.translation().y).toBeGreaterThan(0.5);
    expect(crate.translation().y).toBeLessThan(1.0);
  });

  it("Stanley can jump the gap to the boat", () => {
    const g = play(crateExpectations);
    g.props.find((p) => p.fragile)!.body.setTranslation({ x: 2.5, y: 1.45 }, true);
    moveStanley(g, 5.5, 0);
    let jumped = false;
    run(g, 3, () => {
      const x = g.stanley.rig.pelvis.translation().x;
      const jump = !jumped && x > 8.45;
      if (jump) jumped = true;
      return { move: 1, jump };
    });
    expect(g.stanley.rig.pelvis.translation().x).toBeGreaterThan(11.2);
    expect(g.stanley.rig.pelvis.translation().y).toBeGreaterThan(1.9);
  });
});

describe("Fish Toss", () => {
  it("is done with four fish in the ice", () => {
    const g = play(fishToss);
    g.props.filter((p) => p.kind === "fish").slice(0, 4).forEach((f, i) => f.body.setTranslation({ x: 11.7 + i * 0.3, y: 1.4 + i * 0.15 }, true));
    run(g, 1.5);
    expect(g.progress.done).toBe(true);
  });

  it("fish slip out of Stanley's hands when he runs with them", () => {
    const g = play(fishToss);
    const fish = g.props.find((p) => p.kind === "fish")!.body;
    fish.setTranslation({ x: 3.4, y: 1.6 }, true);
    fish.setGravityScale(0, true);
    run(g, 1, () => ({ reach: fish.translation(), grip: { L: true, R: true } }));
    fish.setGravityScale(1, true);
    expect(g.held.has(fish)).toBe(true);
    const ev = collect(g, 4, () => ({ move: g.stanley.rig.pelvis.translation().x < 6 ? 0.5 : -0.5, reach: { x: g.stanley.shoulder.x + 0.3, y: g.stanley.shoulder.y }, grip: { L: true, R: true } }));
    expect(ev.some((e) => e.type === "score" && e.text === "Slippery!")).toBe(true);
  });

  it("throwing something at the seagull is a secret", () => {
    const g = play(fishToss);
    const fish = g.props.find((p) => p.kind === "fish")!.body;
    fish.setTranslation({ x: 9.2, y: 2.4 }, true);
    fish.setLinvel({ x: 2, y: 0 }, true);
    const ev = collect(g, 1);
    expect(ev.filter((e) => e.type === "secret").map((e) => (e as { id: string }).id)).toEqual(["gull"]);
  });
});

describe("Roll Out the Barrels", () => {
  it("is done with both barrels in the hold", () => {
    const g = play(rollOut);
    g.props.filter((p) => p.kind === "barrel").forEach((b, i) => b.body.setTranslation({ x: 11.6 + i * 0.9, y: 0.5 }, true));
    run(g, 1.5);
    expect(g.progress.done).toBe(true);
  });

  it("walking into a barrel rolls it along", () => {
    const g = play(rollOut);
    const barrel = g.props.find((p) => p.kind === "barrel")!.body;
    const x0 = barrel.translation().x;
    run(g, 2.5, { move: 0.5 });
    expect(barrel.translation().x).toBeGreaterThan(x0 + 0.8);
  });

  it("the bollard stops a rolling barrel", () => {
    const g = play(rollOut);
    const barrel = g.props.find((p) => p.kind === "barrel")!.body;
    barrel.setTranslation({ x: 6, y: 1.33 }, true);
    barrel.setLinvel({ x: 2.5, y: 0 }, true);
    run(g, 2);
    expect(barrel.translation().x).toBeLessThan(7.2);
  });
});

describe("Crow's Nest", () => {
  it("Stanley can climb onto the first spar", () => {
    const g = play(crowsNest);
    g.props.find((p) => p.fragile)!.body.setTranslation({ x: 0.6, y: 0.41 }, true);
    moveStanley(g, 3.2, 0);
    run(g, 1);
    const hold = { L: true, R: true };
    const s = () => g.stanley.shoulder;
    run(g, 0.6, (t) => ({ jump: t === 0, reach: { x: 5.75, y: 2.9 }, grip: hold }));
    expect(g.stanley.grips.L.holdingStatic || g.stanley.grips.R.holdingStatic).toBe(true);
    run(g, 1, () => ({ reach: { x: s().x + 0.1, y: s().y - 0.7 }, grip: hold }));
    run(g, 1, () => ({ move: 1, reach: { x: s().x + 0.1, y: s().y - 0.7 }, grip: hold }));
    run(g, 0.6, { move: 1 });
    run(g, 0.8);
    expect(g.stanley.rig.pelvis.translation().y).toBeGreaterThan(2.7);
  });

  it("from the crow's nest, Stanley can ring the bell", () => {
    const g = play(crowsNest);
    moveStanley(g, 6.5 - 1.8, 5.95);
    run(g, 0.8);
    for (let i = 0; i < 4 && !g.progress.done; i++) run(g, 1, (t) => ({ move: 0.3, jump: t === 0, reach: { x: 7.9, y: 6.55 } }));
    expect(g.progress.done).toBe(true);
  });
});

describe("Secrets", () => {
  it("knocking the gnome over offends him, once", () => {
    const g = play(dingDong);
    const gnome = g.props.find((p) => p.kind === "gnome")!;
    gnome.body.setRotation(1.5, true);
    const ev = collect(g, 1);
    expect(ev.filter((e) => e.type === "secret")).toHaveLength(1);
    expect(gnome.mood).toBe("offended");
  });

  it("pointing at the wedding photo finds it", () => {
    const g = play(laundryDay);
    const ev = collect(g, 1.5, { reach: { x: 5.25, y: 2.8 } });
    expect(ev.some((e) => e.type === "secret" && e.id === "wedding")).toBe(true);
  });
});
