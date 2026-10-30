import { OFFICE, type Level } from "../level";
import type { Prop } from "../kit";
import { Curio } from "../curio";
import type { GameEvent } from "../../sim/game";

const SLOTS = [
  { x0: 6.8, x1: 7.7, y: 0.75, color: "#e85d5d", name: "red" },
  { x0: 7.9, x1: 8.8, y: 1.45, color: "#5d9de8", name: "blue" },
  { x0: 9.0, x1: 9.9, y: 2.15, color: "#f2c94c", name: "yellow" },
];
const DEPTH = 0.42;

/** Skyscraper job 2: sort three parcels into the matching shelves, which climb the wall. */
export const mailRoom: Level = {
  id: "mail-room",
  title: "Mail Room",
  goal: "Put each parcel in the shelf of the same colour.",
  icon: "📮",
  par: [30, 70],
  bounds: { w: 11, h: 4.6 },
  spawn: { x: 1.4, y: 0 },
  target: { x: 8.4, y: 2.0 },
  theme: { ...OFFICE, top: "#e8e4dc", bottom: "#d6d0c4" },
  build(kit) {
    kit.enclosure(11, 4.6);
    for (const s of SLOTS) {
      kit.basket(s.x0, s.x1, s.y, DEPTH);
      kit.solid((s.x0 + s.x1) / 2, s.y / 2, 0.06, s.y / 2, "post");
    }
    const parcels: (Prop & { slot: number })[] = [
      { x: 2.6, slot: 2 },
      { x: 3.6, slot: 0 },
      { x: 4.6, slot: 1 },
    ].map(({ x, slot }) => Object.assign(kit.box(x, 0.17, 0.17, 0.16, { kind: "parcel", density: 10, color: SLOTS[slot].color }), { slot }));
    kit.fragile(5.6, 0, "planter");
    const postcard = new Curio("postcard", "A postcard for G.T.: \"Call your son. — M.\"", { x0: 0.5, y0: 2.2, x1: 1.4, y1: 2.9 }, 0.5);
    const filed = () => parcels.filter((p) => {
      const q = p.body.translation();
      const s = SLOTS[p.slot];
      return q.x > s.x0 && q.x < s.x1 && q.y > s.y && q.y < s.y + DEPTH + 0.2;
    }).length;
    let last = 0;
    return {
      update(game, dt) {
        const n = filed();
        const ev: GameEvent[] = n > last ? [{ type: "score", text: "Sorted!", pos: { x: 8.4, y: 3.0 } }] : [];
        last = n;
        return [...ev, ...postcard.update(game, dt)];
      },
      progress: () => {
        const n = filed();
        return { done: n === parcels.length, label: `Parcels sorted ${n}/${parcels.length}` };
      },
      drawBack(r) {
        // Pigeonholes, a corkboard with a postcard pinned to it, the franking machine.
        r.rect(0.4, 2.0, 2.4, 3.1, "#c8a878");
        r.rect(0.55, 2.25, 1.35, 2.85, "#f4efe6");
        r.text("Wish you", { x: 0.95, y: 2.65 }, 0.07, "#3b6ea8");
        r.text("were here", { x: 0.95, y: 2.5 }, 0.07, "#3b6ea8");
        r.rect(1.6, 2.4, 2.2, 2.8, "#f2c94c");
        r.text("G.T.", { x: 1.9, y: 2.6 }, 0.1, "#5b3a2a");
        r.roundRect(3.2, 0, 4.2, 0.85, 0.05, "#9aa0a8");
        r.text("FRANK-O-MATIC", { x: 3.7, y: 0.5 }, 0.08, "#2a2230");
        r.text("MAIL ROOM", { x: 5.5, y: 3.8 }, 0.24, "#7a6a5a");
      },
      drawFront(r) {
        // Each shelf's coloured front.
        for (const s of SLOTS) r.rect(s.x0, s.y, s.x1, s.y + 0.12, s.color);
      },
    };
  },
};
