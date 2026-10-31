import { describe, expect, it } from "vitest";
import { clearSave, emptySave, loadSave, recordJob, recordOvertime, writeSave, type Storage } from "../src/app/save";

const memory = (): Storage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
};

describe("save", () => {
  it("round-trips progress", () => {
    const store = memory();
    const s = emptySave();
    recordJob(s, "ding-dong", 2, 12.5, ["No Falls"]);
    s.seen.onboarding = true;
    writeSave(s, store);
    expect(loadSave(store)).toEqual(s);
  });

  it("keeps the best stars and time, and merges tags", () => {
    const s = emptySave();
    recordJob(s, "x", 3, 9, ["A"]);
    const { record, newBest } = recordJob(s, "x", 1, 30, ["B"]);
    expect(newBest).toBe(false);
    expect(record).toEqual({ stars: 3, best: 9, tags: ["A", "B"] });
    expect(recordJob(s, "x", 3, 7, []).newBest).toBe(true);
  });

  it("survives missing, corrupt or blocked storage", () => {
    expect(loadSave(null)).toEqual(emptySave());
    const store = memory();
    store.setItem("tumbler.save.v1", "{nope");
    expect(loadSave(store)).toEqual(emptySave());
    const broken: Storage = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); }, removeItem: () => {} };
    expect(loadSave(broken)).toEqual(emptySave());
    expect(() => writeSave(emptySave(), broken)).not.toThrow();
    clearSave(store);
    expect(store.data.size).toBe(0);
  });
});

describe("Overtime and the regular stars", () => {
  it("beating the ★★★ time in Overtime earns the regular ★★★ too", () => {
    const s = emptySave();
    recordJob(s, "crows-nest", 2, 40, []);
    recordOvertime(s, "crows-nest", 2, 13.8, 3);
    expect(s.jobs["crows-nest"].stars).toBe(3);
    expect(s.overtime["crows-nest"].bonus).toBe(2);
  });

  it("older saves with ★4 already earned get their ★★★ when loaded", () => {
    const store = memory();
    const s = emptySave();
    recordJob(s, "crows-nest", 2, 40, []);
    s.overtime["crows-nest"] = { bonus: 2, best: 13.8 };
    writeSave(s, store);
    expect(loadSave(store).jobs["crows-nest"].stars).toBe(3);
  });
});
