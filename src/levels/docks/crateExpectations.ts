import { HARBOUR, type Level } from "../level";
import type { Prop } from "../kit";
import { Curio } from "../secrets";
import type { Renderer } from "../../render/renderer";

const DOCK_Y = 1.0;
const DECK_Y = 1.3;
const BOAT_X = 11;
const NEEDED = 3;

/** Docks job 1: get three crates onto the boat, across a gap of open water. */
export const crateExpectations: Level = {
  id: "crate-expectations",
  title: "Crate Expectations",
  goal: `Get ${NEEDED} crates onto the boat.`,
  icon: "🚢",
  par: [25, 60],
  bounds: { w: 17, h: 7 },
  spawn: { x: 1.5, y: DOCK_Y },
  target: { x: 13.5, y: DECK_Y + 0.6 },
  theme: HARBOUR,
  build(kit) {
    kit.enclosure(17, 7, true);
    kit.solid(4.5, DOCK_Y / 2, 4.5, DOCK_Y / 2, "dock");
    kit.water(9, BOAT_X, 0.75);
    kit.solid(14, DECK_Y / 2, 3, DECK_Y / 2, "hull");
    const crates: Prop[] = [2.8, 3.5, 4.2].map((x) => kit.box(x, DOCK_Y + 0.29, 0.28, 0.28, { kind: "crate", density: 9, color: "#b9895a" }));
    // A gangplank, if you think of it.
    kit.box(6.7, DOCK_Y + 0.06, 1.3, 0.05, { kind: "plank", density: 6, color: "#a8784a" });
    kit.fragile(8.45, DOCK_Y, "bottles");
    const crab = new Curio("crab", "The crab would like a word.", { x0: 8.55, y0: DOCK_Y, x1: 8.95, y1: DOCK_Y + 0.3 }, 0.5);

    const aboard = () => crates.filter((c) => c.body.translation().x > BOAT_X + 0.1 && c.body.translation().y > DECK_Y).length;
    let last = 0;
    return {
      progress: () => {
        const n = Math.min(aboard(), NEEDED);
        return { done: n >= NEEDED, label: `Crates aboard ${n}/${NEEDED}` };
      },
      update(game, dt) {
        const n = aboard();
        const ev = n > last ? [{ type: "score" as const, text: "ABOARD!", pos: { x: 13, y: 2.4 } }] : [];
        last = n;
        return [...ev, ...crab.update(game, dt)];
      },
      drawBack(r) {
        // Boat cabin, mast stub, portholes, life ring.
        r.rect(13.6, DECK_Y, 16.4, DECK_Y + 1.6, "#f4efe6");
        r.poly([{ x: 13.4, y: DECK_Y + 1.6 }, { x: 16.6, y: DECK_Y + 1.6 }, { x: 16.2, y: DECK_Y + 1.9 }, { x: 13.8, y: DECK_Y + 1.9 }], "#3b6ea8");
        for (const x of [14.2, 15.0, 15.8]) r.circle({ x, y: DECK_Y + 0.95 }, 0.17, "#8fc1d9");
        r.ring({ x: 12.3, y: DECK_Y + 0.6 }, 0.22, "#e85d5d", 0.1);
        r.text("S.S. GOOD ENOUGH", { x: 14, y: 0.55 }, 0.22, "rgba(255,255,255,0.85)");
      },
      drawFront(r) {
        drawCrab(r, crab.found ? crab.age : -1);
      },
    };
  },
};

/** A small crab at the edge of the dock. Bother it and up go the claws. */
export function drawCrab(r: Renderer, foundAge: number) {
  const x = 8.75;
  const y = DOCK_Y + 0.08;
  const up = foundAge >= 0 ? Math.min(1, foundAge * 4) : 0;
  r.roundRect(x - 0.13, y - 0.06, x + 0.13, y + 0.07, 0.06, "#e8603c");
  for (const s of [-1, 1]) {
    r.line({ x: x + s * 0.1, y: y + 0.02 }, { x: x + s * 0.2, y: y + 0.06 + up * 0.14 }, 0.03, "#e8603c");
    r.circle({ x: x + s * 0.21, y: y + 0.08 + up * 0.15 }, 0.045, "#e8603c");
    r.line({ x: x + s * 0.05, y: y + 0.07 }, { x: x + s * 0.06, y: y + 0.12 }, 0.015, "#e8603c");
    r.circle({ x: x + s * 0.06, y: y + 0.13 }, 0.02, "#2a2230");
  }
}
