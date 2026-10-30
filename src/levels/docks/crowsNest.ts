import { HARBOUR, type Level } from "../level";
import { Curio } from "../curio";

const A = { x0: 5.6, x1: 7.2, y: 2.0 };
const B = { x0: 7.8, x1: 9.4, y: 3.9 };
const C = { x0: 5.2, x1: 7.4, y: 5.8 };
const BELL_Y = C.y + 0.75;
const MAST_X = 7.55;

/** Docks job 4: climb the rigging to the crow's nest and ring the ship's bell. */
export const crowsNest: Level = {
  id: "crows-nest",
  title: "Crow's Nest",
  goal: "Climb to the crow's nest and ring the ship's bell.",
  icon: "🔔",
  par: [25, 60],
  bounds: { w: 12, h: 10 },
  spawn: { x: 1.8, y: 0 },
  target: { x: MAST_X - 0.2, y: BELL_Y },
  theme: { ...HARBOUR, floor: "#8a6a4e", floorTop: "#a5825f" },
  build(kit) {
    kit.enclosure(12, 10, true);
    for (const p of [A, B, C]) kit.solid((p.x0 + p.x1) / 2, p.y, (p.x1 - p.x0) / 2, 0.1, "ledge");
    // The mast above the crow's nest, with the bell on it.
    kit.solid(MAST_X + 0.15, C.y + 1.0, 0.15, 0.9, "post");
    const bell = kit.button(MAST_X, BELL_Y, 0.12, 0.14);
    bell.style = "bell";
    kit.fragile(4.0, 0, "bottles");
    const golf = new Curio("golfball", "That's not an egg. It's a golf ball, monogrammed \"G.T.\"", { x0: C.x0, y0: C.y + 0.1, x1: C.x0 + 0.5, y1: C.y + 0.45 }, 0.5);
    let rung = 0;

    return {
      progress: () => ({ done: bell.presses > 0, label: bell.presses > 0 ? "DONG!" : "Ring the bell" }),
      update(game, dt) {
        const ev = golf.update(game, dt);
        if (bell.presses !== rung) {
          rung = bell.presses;
          ev.push({ type: "score", text: "DONG!", pos: { x: MAST_X - 0.5, y: BELL_Y + 0.5 } });
        }
        return ev;
      },
      drawBack(r) {
        // The mast, rigging and a flag.
        r.rect(MAST_X, 0, MAST_X + 0.3, 8.6, "#8a6a4e");
        r.poly([{ x: MAST_X + 0.3, y: 8.6 }, { x: MAST_X + 1.4, y: 8.3 }, { x: MAST_X + 0.3, y: 8.0 }], "#e85d5d");
        for (let i = 0; i < 7; i++) {
          r.line({ x: 3 + i * 0.35, y: 0 }, { x: MAST_X, y: 8.2 - i * 0.2 }, 0.015, "rgba(90,70,50,0.45)");
          r.line({ x: 11.6 - i * 0.35, y: 0 }, { x: MAST_X + 0.3, y: 8.2 - i * 0.2 }, 0.015, "rgba(90,70,50,0.45)");
        }
        // Ship's rail along the deck.
        r.rect(0, 0.75, 12, 0.82, "#6b4a3a");
        for (let x = 0.3; x < 12; x += 0.6) r.rect(x, 0, x + 0.06, 0.8, "#6b4a3a");
        // The nest, with the "egg".
        r.roundRect(C.x0 + 0.02, C.y + 0.08, C.x0 + 0.48, C.y + 0.24, 0.08, "#a8784a");
        r.circle({ x: C.x0 + 0.25, y: C.y + 0.26 }, 0.07, "#ffffff");
        r.circle({ x: C.x0 + 0.23, y: C.y + 0.28 }, 0.012, "rgba(0,0,0,0.2)");
        r.circle({ x: C.x0 + 0.28, y: C.y + 0.24 }, 0.012, "rgba(0,0,0,0.2)");
        // Crow's nest railing.
        r.rect(C.x0, C.y + 0.1, C.x0 + 0.05, C.y + 0.6, "#6b4a3a");
        r.rect(C.x0, C.y + 0.55, C.x1, C.y + 0.6, "#6b4a3a");
      },
    };
  },
};
