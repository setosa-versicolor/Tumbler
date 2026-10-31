import { beforeAll, describe, expect, it } from "vitest";
import { initPhysics } from "../src/physics/world";
import { Game, type GameEvent } from "../src/sim/game";
import { DEFAULT_TUNING } from "../src/sim/tuning";
import { IDLE_INTENT, type Intent } from "../src/physics/body/stanley";
import { ALL_LEVELS, overtimeBonus } from "../src/app/campaign";
import { LEVEL_TWISTS, TWISTS, twistFor } from "../src/levels/twists";
import { fishToss } from "../src/levels/docks/fishToss";
import { pinReset } from "../src/levels/downtown/pinReset";
import { emptySave, loadSave, recordOvertime, writeSave, type Storage } from "../src/app/save";
import { dayOff } from "../src/levels/dayOff";
import { dingDong } from "../src/levels/suburb/dingDong";
import { stackIt } from "../src/levels/suburb/stackIt";

beforeAll(() => initPhysics());

const collect = (g: Game, seconds: number, intent: Partial<Intent> | ((t: number) => Partial<Intent>) = {}) => {
  const out: GameEvent[] = [];
  for (let i = 0; i < Math.round(seconds * 120); i++) out.push(...g.step({ ...IDLE_INTENT, ...(typeof intent === "function" ? intent(i / 120) : intent) }));
  return out;
};
const withTwist = (id: string, level = dayOff, seed = 1) => new Game({ ...DEFAULT_TUNING }, level, seed, TWISTS[id]);

describe("Overtime twists", () => {
  it("every job has a twist, and each runs on its job without trouble", { timeout: 60000 }, () => {
    for (const level of ALL_LEVELS.filter((l) => !l.sandbox)) {
      const twist = twistFor(level.id);
      expect(twist, level.id).not.toBeNull();
      const g = new Game({ ...DEFAULT_TUNING }, level, 1, twist);
      collect(g, 8, (t) => ({ move: Math.sin(t) * 0.6 }));
      for (const b of g.stanley.rig.bodies) expect(Number.isFinite(b.translation().x)).toBe(true);
    }
  });

  it("cannonballs flatten Stanley", () => {
    const g = withTwist("cannons", stackIt);
    const ev = collect(g, 8);
    expect(ev.some((e) => e.type === "sfx" && e.name === "boom")).toBe(true);
    expect(ev.some((e) => e.type === "ouch")).toBe(true);
    expect(g.falls).toBeGreaterThan(0);
  });

  it("cannonballs clear whatever's next to the cannon (Fish Toss: a crate one side, the backboard the other)", () => {
    for (const x of [3, 11]) {
      const g = withTwist("cannons", fishToss);
      // Stand him at either end, so either cannon has to fire past its clutter.
      for (const b of g.stanley.rig.bodies) {
        const p = b.translation();
        b.setTranslation({ x: p.x - 2.8 + x, y: p.y }, true);
      }
      const ev = collect(g, 10);
      expect(ev.some((e) => e.type === "ouch"), `standing at ${x}`).toBe(true);
    }
  });

  it("Pin Reset's twist leaves pins that are stood up standing", () => {
    const g = new Game({ ...DEFAULT_TUNING }, pinReset, 1, twistFor("pin-reset"));
    g.props.filter((p) => p.kind === "pin").slice(0, 4).forEach((p, i) => {
      p.body.setTranslation({ x: 10.16 + i * 0.65, y: 0.21 }, true);
      p.body.setRotation(0, true);
    });
    collect(g, 4);
    expect(g.progress.done).toBe(true);
  });

  it("the goblin stabs Stanley if he walks into it", () => {
    const g = withTwist("goblin", dingDong);
    const ev = collect(g, 14, { move: 0.35 });
    expect(ev.some((e) => e.type === "ouch" && e.text === "OW!")).toBe(true);
  });

  it("startle the rabbit and you'll slip on what it leaves", () => {
    const g = withTwist("rabbit");
    // Charge back and forth past the rabbit.
    const ev = collect(g, 12, (t) => ({ move: Math.sin(t * 1.2) > 0 ? 1 : -1 }));
    expect(ev.some((e) => e.type === "sfx" && e.name === "poop")).toBe(true);
    expect(ev.some((e) => e.type === "ouch" && e.text === "WHOOPS!")).toBe(true);
  });

  it("low gravity means big jumps", () => {
    const normal = new Game({ ...DEFAULT_TUNING }, dayOff);
    const moon = withTwist("moon");
    const peak = (g: Game) => {
      collect(g, 0.5);
      const y0 = g.stanley.rig.pelvis.translation().y;
      let max = y0;
      g.step({ ...IDLE_INTENT, jump: true });
      for (let i = 0; i < 300; i++) {
        g.step(IDLE_INTENT);
        max = Math.max(max, g.stanley.rig.pelvis.translation().y);
      }
      return max - y0;
    };
    expect(peak(moon)).toBeGreaterThan(peak(normal) * 2);
  });

  it("on a waxed floor Stanley can't stop", () => {
    // Speed after letting go of the stick for a bit.
    const coasting = (g: Game) => {
      g.props.forEach((p, i) => p.body.setTranslation({ x: 14 + (i % 3) * 0.6, y: 3 + i * 0.7 }, true));
      collect(g, 0.5);
      collect(g, 1, { move: 1 });
      collect(g, 0.6);
      return Math.abs(g.stanley.rig.pelvis.linvel().x);
    };
    expect(coasting(new Game({ ...DEFAULT_TUNING, trippiness: 0 }, dayOff))).toBeLessThan(0.4);
    expect(coasting(withTwist("ice"))).toBeGreaterThan(0.6);
  });

  it("each twist is assigned to real jobs", () => {
    for (const id of Object.values(LEVEL_TWISTS)) expect(TWISTS[id]).toBeDefined();
  });
});

describe("Overtime stars", () => {
  it("★4 for the ★★★ time with the twist, ★5 for that and nothing broken", () => {
    expect(overtimeBonus(dingDong, dingDong.par[0] + 0.1, 0)).toBe(0);
    expect(overtimeBonus(dingDong, dingDong.par[0], 1)).toBe(1);
    expect(overtimeBonus(dingDong, dingDong.par[0] - 1, 0)).toBe(2);
  });

  it("saves the best bonus and time", () => {
    const store = new Map<string, string>();
    const storage: Storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v), removeItem: (k) => void store.delete(k) };
    const s = emptySave();
    recordOvertime(s, "ding-dong", 2, 7);
    expect(recordOvertime(s, "ding-dong", 0, 30)).toEqual({ record: { bonus: 2, best: 7 }, newBest: false });
    writeSave(s, storage);
    expect(loadSave(storage).overtime).toEqual({ "ding-dong": { bonus: 2, best: 7 } });
  });
});
