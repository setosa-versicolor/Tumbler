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
import { BARKS, ONBOARDING, REVIEW_1, REVIEW_2, REVIEW_3, REVIEW_4, SIGN_OFF } from "../src/story/scripts";
import { crateExpectations } from "../src/levels/docks/crateExpectations";
import { fishToss } from "../src/levels/docks/fishToss";
import { rollOut } from "../src/levels/docks/rollOut";
import { crowsNest } from "../src/levels/docks/crowsNest";
import type { GameEvent } from "../src/sim/game";
import { movingDay } from "../src/levels/downtown/movingDay";
import { hangThePainting } from "../src/levels/downtown/hangThePainting";
import { pinReset } from "../src/levels/downtown/pinReset";
import { coffeeRun } from "../src/levels/downtown/coffeeRun";
import { wrapAngle } from "../src/sim/math";
import { windowWasher } from "../src/levels/skyscraper/windowWasher";
import { mailRoom } from "../src/levels/skyscraper/mailRoom";
import { shredIt } from "../src/levels/skyscraper/shredIt";
import { fireDrill } from "../src/levels/skyscraper/fireDrill";
import { executiveAction } from "../src/levels/finale/executiveAction";
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
      // Standing height above whatever's underfoot (which may be moving).
      expect(g.stanley.balance.groundDist).toBeGreaterThan(0.75);
      expect(g.stanley.balance.groundDist).toBeLessThan(1.1);
      void p;
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
  for (const script of [ONBOARDING, REVIEW_1, REVIEW_2, REVIEW_3, REVIEW_4]) {
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

  it("throwing something at the seagull scares it off", () => {
    const g = play(fishToss);
    const fish = g.props.find((p) => p.kind === "fish")!.body;
    fish.setTranslation({ x: 9.2, y: 2.4 }, true);
    fish.setLinvel({ x: 2, y: 0 }, true);
    const ev = collect(g, 1);
    expect(ev.filter((e) => e.type === "surprise").map((e) => (e as { id: string }).id)).toEqual(["gull"]);
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

describe("Surprises", () => {
  it("knocking the gnome over offends him, once", () => {
    const g = play(dingDong);
    const gnome = g.props.find((p) => p.kind === "gnome")!;
    gnome.body.setRotation(1.5, true);
    const ev = collect(g, 1);
    expect(ev.filter((e) => e.type === "surprise")).toHaveLength(1);
    expect(gnome.mood).toBe("offended");
  });

});

describe("Gerald's jokes", () => {
  it("no line is used twice anywhere in the cutscenes, except the sign-off", () => {
    const lines = [
      ...[ONBOARDING, REVIEW_1, REVIEW_2, REVIEW_3, REVIEW_4].flatMap((s) => s.steps.flatMap((st) => ("text" in st ? [st.text] : []))),
      ...Object.values(BARKS).flat(),
    ];
    // The sign-off is the one line that's meant to repeat.
    const dupes = lines.filter((l, i) => lines.indexOf(l) !== i && l !== SIGN_OFF);
    expect(dupes).toEqual([]);
    for (const script of [ONBOARDING, REVIEW_1, REVIEW_2, REVIEW_3, REVIEW_4]) {
      expect(script.steps.some((st) => st.do === "say" && st.text === SIGN_OFF), script.id).toBe(true);
    }
  });

  it("knocking the same thing over in later cutscenes gets the next joke each time", () => {
    const counts: Record<string, number> = {};
    const heard: (string | undefined)[] = [];
    for (let i = 0; i < BARKS.cooler.length + 1; i++) {
      const g = play(office);
      const scene = new Cutscene(REVIEW_1, g, counts);
      g.props.find((p) => p.tag === "cooler")!.body.setRotation(1.5, true);
      let text: string | undefined;
      for (let k = 0; k < 30 && !text; k++) {
        g.step(scene.update(1 / 120));
        const b = scene.bubble();
        if (b?.aside) text = b.text;
      }
      heard.push(text);
    }
    expect(heard.slice(0, -1)).toEqual(BARKS.cooler);
    // After the last one, he starts over rather than going quiet.
    expect(heard.at(-1)).toBe(BARKS.cooler[0]);
  });
});

describe("Picking things up", () => {
  const reachLow = (level: Level, move: number, seed: number) => {
    const g = new Game({ ...DEFAULT_TUNING }, level, seed);
    for (let i = 0; i < 120 * 2.5; i++) {
      const p = g.stanley.rig.pelvis.translation();
      g.step({ ...IDLE_INTENT, move, reach: { x: p.x + 0.6, y: level.spawn.y + 0.05 }, grip: { L: true, R: true } });
    }
    return g.falls;
  };

  it("reaching low while standing or walking never knocks Stanley over", () => {
    for (const level of [laundryDay, fishToss]) for (const move of [0, 0.5]) for (const seed of [1, 2, 3]) expect(reachLow(level, move, seed)).toBe(0);
  });

  it("charging along bent over only occasionally ends in a trip", () => {
    const seeds = Array.from({ length: 20 }, (_, i) => i + 1);
    const fell = seeds.filter((s) => reachLow(laundryDay, 1, s) > 0).length;
    expect(fell).toBeGreaterThan(0);
    expect(fell).toBeLessThan(10);
  });
});

describe("Moving Day", () => {
  it("is done with the sofa in the van", () => {
    const g = play(movingDay);
    g.props.find((p) => p.kind === "sofa")!.body.setTranslation({ x: 13.2, y: 1.2 }, true);
    run(g, 1.5);
    expect(g.progress.done).toBe(true);
  });

  it("the sofa doesn't fit through the doorway overhead", () => {
    const g = play(movingDay);
    const sofa = g.props.find((p) => p.kind === "sofa")!.body;
    sofa.setTranslation({ x: 5.0, y: 2.5 }, true);
    sofa.setGravityScale(0, true);
    sofa.setLinvel({ x: 2, y: 0 }, true);
    run(g, 1);
    expect(sofa.translation().x).toBeLessThan(5.9);
  });

  it("Stanley can walk up the ramp into the van", () => {
    const g = play(movingDay);
    g.props.find((p) => p.fragile)!.body.setTranslation({ x: 1.0, y: 0.51 }, true);
    moveStanley(g, 7.0, 0);
    run(g, 3, { move: 0.5 });
    const p = g.stanley.rig.pelvis.translation();
    expect(p.x).toBeGreaterThan(11.5);
    expect(p.y).toBeGreaterThan(1.6);
  });
});

describe("Hang the Painting", () => {
  it("hooks when the wire reaches the hook, then counts once it hangs level", () => {
    const g = play(hangThePainting);
    const painting = g.props.find((p) => p.kind === "painting")!;
    painting.body.setGravityScale(0, true);
    painting.body.setTranslation({ x: 9.2, y: 2.55 - (painting.hh - 0.06) }, true);
    painting.body.setRotation(0.2, true);
    const ev = collect(g, 0.2);
    painting.body.setGravityScale(1, true);
    expect(ev.some((e) => e.type === "score" && e.text === "Hooked!")).toBe(true);
    run(g, 6);
    expect(g.progress.done).toBe(true);
  });
});

describe("Pin Reset", () => {
  it("is done with six pins standing on the deck", () => {
    const g = play(pinReset);
    g.props.filter((p) => p.kind === "pin").slice(0, 6).forEach((p, i) => {
      p.body.setTranslation({ x: 10.3 + i * 0.36, y: 0.2 }, true);
      p.body.setRotation(0, true);
    });
    run(g, 2);
    expect(g.progress.done).toBe(true);
  });

  it("a pin grabbed by its end dangles upright", () => {
    const g = play(pinReset);
    const pin = g.props.find((p) => p.kind === "pin")!.body;
    pin.setTranslation({ x: 2.3, y: 0.075 }, true);
    pin.setRotation(Math.PI / 2, true);
    run(g, 0.5);
    // The pin's end nearest Stanley.
    const end = { x: pin.translation().x - 0.16, y: 0.08 };
    run(g, 1.5, { reach: end, grip: { L: true, R: true } });
    expect(g.held.has(pin)).toBe(true);
    // Lift smoothly, the way a thumb would, then hold it out.
    const from = { ...end };
    run(g, 2.5, (t) => {
      const k = Math.min(1, t / 1.2);
      const to = { x: g.stanley.shoulder.x + 0.6, y: g.stanley.shoulder.y + 0.1 };
      return { reach: { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k }, grip: { L: true, R: true } };
    });
    // It swings like a pendulum, centred on hanging straight down.
    let sum = 0;
    for (let i = 0; i < 120; i++) {
      run(g, 1 / 120, { reach: { x: g.stanley.shoulder.x + 0.6, y: g.stanley.shoulder.y + 0.1 }, grip: { L: true, R: true } });
      sum += wrapAngle(pin.rotation() - (Math.cos(pin.rotation()) < 0 ? Math.PI : 0));
    }
    expect(g.held.has(pin)).toBe(true);
    expect(Math.abs(sum / 120)).toBeLessThan(0.25);
  });
});

describe("Coffee Run", () => {
  it("Stanley can carry the tray over and serve the coffees", { timeout: 20000 }, () => {
    const g = play(coffeeRun);
    g.props.find((p) => p.kind === "lamp")!.body.setTranslation({ x: 13.7, y: 0.51 }, true);
    const tray = g.props.find((p) => p.kind === "tray")!.body;
    const hold = { L: true, R: true };
    const sh = () => g.stanley.shoulder;
    run(g, 0.5);
    run(g, 2, { move: -0.4 });
    const grabAt = { x: tray.translation().x + 0.3, y: tray.translation().y + 0.03 };
    run(g, 1, { reach: grabAt, grip: hold });
    run(g, 0.5, { reach: { x: grabAt.x, y: 1.2 }, grip: hold });
    // Swing it across in front, like a thumb sweeping over.
    for (let k = 0; k <= 180; k++) run(g, 1 / 120, () => ({ reach: { x: sh().x - Math.cos((Math.PI * k) / 180) * 0.6, y: 1.2 }, grip: hold }));
    run(g, 10, () => ({ move: g.stanley.rig.pelvis.translation().x < 11.4 ? 0.45 : 0, reach: { x: sh().x + 0.6, y: 1.2 }, grip: hold }));
    run(g, 1, () => ({ reach: { x: sh().x + 0.6, y: 0.95 }, grip: hold }));
    run(g, 2, () => ({ reach: { x: sh().x + 0.6, y: 0.95 } }));
    expect(g.progress.done).toBe(true);
  });
});

describe("Window Washer", () => {
  it("Stanley rides the cradle and can scrub every window over a trip up and down", { timeout: 30000 }, () => {
    const g = play(windowWasher);
    g.props.find((p) => p.kind === "bucket")!.body.setTranslation({ x: 2.9, y: 0.6 }, true);
    run(g, 4);
    expect(g.stanley.rig.pelvis.translation().y).toBeGreaterThan(windowWasher.spawn.y + 2);
    expect(g.stanley.balance.posture).toBe("up");
    // Scrub up and down at shoulder height against the glass the whole way.
    run(g, 32, (t) => ({ move: 0.4, reach: { x: 6.1, y: g.stanley.shoulder.y + Math.sin(t * 10) * 0.35 } }));
    expect(g.progress.done).toBe(true);
  });
});

describe("Mail Room", () => {
  it("counts parcels only in the shelf of their own colour", () => {
    const g = play(mailRoom);
    const parcels = g.props.filter((p) => p.kind === "parcel");
    const red = parcels.find((p) => p.color === "#e85d5d")!;
    const blue = parcels.find((p) => p.color === "#5d9de8")!;
    const yellow = parcels.find((p) => p.color === "#f2c94c")!;
    red.body.setTranslation({ x: 8.35, y: 1.8 }, true); // the blue shelf
    run(g, 1);
    expect(g.progress.label).toBe("Parcels sorted 0/3");
    red.body.setTranslation({ x: 7.25, y: 1.1 }, true);
    blue.body.setTranslation({ x: 8.35, y: 1.8 }, true);
    yellow.body.setTranslation({ x: 9.45, y: 2.5 }, true);
    run(g, 1.5);
    expect(g.progress.done).toBe(true);
  });
});

describe("Shred It", () => {
  it("paper dropped in the shredder is shredded", () => {
    const g = play(shredIt);
    const papers = g.props.filter((p) => p.kind === "paper");
    papers.slice(0, 5).forEach((p, i) => p.body.setTranslation({ x: 9.05, y: 1.6 + i * 0.4 }, true));
    run(g, 4);
    expect(g.props.filter((p) => p.kind === "paper")).toHaveLength(1);
    expect(g.progress.done).toBe(true);
  });

  it("the fan blows paper back", () => {
    const g = play(shredIt);
    const paper = g.props.find((p) => p.kind === "paper")!.body;
    paper.setTranslation({ x: 6.5, y: 1.5 }, true);
    run(g, 1);
    expect(paper.translation().x).toBeLessThan(6.2);
  });
});

describe("Fire Drill", () => {
  it("is done with every mannequin outside", () => {
    const g = play(fireDrill);
    g.props.filter((p) => p.kind === "dummy").forEach((d, i) => {
      d.body.setTranslation({ x: 13.3 + i * 0.5, y: 0.51 }, true);
      d.body.setRotation(0, true);
    });
    run(g, 1);
    expect(g.progress.done).toBe(true);
  });

  it("a mannequin fits through the fire exit", () => {
    const g = play(fireDrill);
    const d = g.props.find((p) => p.kind === "dummy")!.body;
    d.setTranslation({ x: 11.8, y: 0.52 }, true);
    d.setLinvel({ x: 5.5, y: 0 }, true);
    run(g, 1.5);
    expect(d.translation().x).toBeGreaterThan(12.8);
  });
});

describe("Executive Action", () => {
  it("is done when the file is in the cabinet", () => {
    const g = play(executiveAction);
    g.props.find((p) => p.kind === "file")!.body.setTranslation({ x: 9.9, y: 1.4 }, true);
    run(g, 1);
    expect(g.progress.done).toBe(true);
  });
});

describe("The reveal", () => {
  it("Review #4 ends with the photo turned round and Stanley's name on the desk", () => {
    const g = play(office);
    const scene = new Cutscene(REVIEW_4, g);
    for (let t = 0; t < 120 && !scene.done; t += 1 / 60) {
      const intent = scene.update(1 / 60);
      g.step(intent);
      g.step(intent);
    }
    expect(scene.done).toBe(true);
    expect(g.props.find((p) => p.kind === "nameplate")!.mood).toBe("STANLEY TUMBLER, CEO");
    expect(g.props.find((p) => p.kind === "photo")!.mood).toBe("front");
  });
});
