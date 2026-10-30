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
import { Cutscene } from "../src/story/cutscene";
import { ONBOARDING, REVIEW_1 } from "../src/story/scripts";
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
      expect(p.y).toBeGreaterThan(0.75);
      expect(p.y).toBeLessThan(1.1);
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
  it("Stanley can run up the stairs", () => {
    const g = play(pizzaUp);
    run(g, 4, { move: 1 });
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
  for (const script of [ONBOARDING, REVIEW_1]) {
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
