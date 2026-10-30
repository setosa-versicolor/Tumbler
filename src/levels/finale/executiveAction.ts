import { type Level } from "../level";
import type { Renderer } from "../../render/renderer";
import type { Game } from "../../sim/game";

const DESK = { x0: 1.4, x1: 3.4, top: 0.8 };
const CABINET = { x0: 9.4, x1: 10.4, top: 1.1, depth: 0.35 };

/** Lines the staff shout when the file goes in, in order. */
export const STAFF_CHEERS = [
  "He did a task. Himself!",
  "Twenty-two years here and I've never seen a CEO touch paper.",
  "Is that… is that what initiative looks like?",
  "Somebody get his signature on that file. That file's going in a museum.",
];

/** Where each cheering member of staff stands, for speech. */
export const STAFF_SPOTS = [
  { x: 4.6, y: 2.3 },
  { x: 5.8, y: 2.35 },
  { x: 7.0, y: 2.3 },
  { x: 8.2, y: 2.35 },
];

/** The final job: CEO Stanley Tumbler moves a file. The whole company watches. */
export const executiveAction: Level = {
  id: "executive-action",
  title: "Executive Action",
  goal: "Move the file from the desk into the filing cabinet.",
  icon: "📁",
  par: [30, 120],
  bounds: { w: 11.5, h: 4.6 },
  spawn: { x: 0.9, y: 0 },
  target: { x: (CABINET.x0 + CABINET.x1) / 2, y: CABINET.top + 0.3 },
  theme: { outdoor: false, top: "#f2ece0", bottom: "#e2d8c6", floor: "#6b4a3a", floorTop: "#82604c" },
  build(kit) {
    kit.enclosure(11.5, 4.6);
    kit.solid((DESK.x0 + DESK.x1) / 2, DESK.top / 2, (DESK.x1 - DESK.x0) / 2, DESK.top / 2, "desk");
    kit.solid((CABINET.x0 + CABINET.x1) / 2, (CABINET.top - 0.04) / 2, (CABINET.x1 - CABINET.x0) / 2, (CABINET.top - 0.04) / 2, "cabinet");
    kit.basket(CABINET.x0, CABINET.x1, CABINET.top, CABINET.depth);
    const file = kit.box(2.4, DESK.top + 0.04, 0.22, 0.035, { kind: "file", density: 6, friction: 0.8, color: "#e8c77a" });
    kit.fragile(6.2, 0, "trophy");
    const inDrawer = () => {
      const q = file.body.translation();
      return q.x > CABINET.x0 && q.x < CABINET.x1 && q.y > CABINET.top && q.y < CABINET.top + CABINET.depth + 0.3;
    };
    return {
      progress: () => ({ done: inDrawer(), label: inDrawer() ? "Filed." : "File → cabinet" }),
      drawBack: (r, game) => drawOffice(r, game),
      drawFront(r) {
        r.rect(CABINET.x0, CABINET.top, CABINET.x1, CABINET.top + CABINET.depth - 0.04, "rgba(122,130,140,0.95)");
        r.text("A–Z", { x: (CABINET.x0 + CABINET.x1) / 2, y: CABINET.top + 0.17 }, 0.1, "#fff");
      },
    };
  },
};

function drawOffice(r: Renderer, game: Game) {
  // Floor-to-ceiling windows behind, a glass wall with the whole staff pressed against it.
  r.rect(0.3, 1.2, 11.2, 4.2, "#9fc4dd");
  for (const [x, h] of [[1, 1.6], [2.4, 2.4], [3.8, 1.9], [5.2, 2.8], [6.6, 2.1], [8.0, 2.6], [9.6, 1.8]] as const) r.rect(x - 0.5, 1.2, x + 0.5, 1.2 + h, "#7fa3bf");
  r.rect(1.2, 2.75, 3.6, 3.2, "#5b3a2a");
  r.text("STANLEY TUMBLER, CEO", { x: 2.4, y: 2.97 }, 0.15, "#f2c94c");
  r.rect(4.0, 0, 9.0, 3.2, "rgba(220,235,245,0.45)");
  const cheering = game.doneAt !== null;
  const t = game.time;
  const colours = ["#37a59c", "#c58be8", "#e85d5d", "#3b6ea8", "#f2c94c", "#7bc96f", "#e8a35c"];
  for (let i = 0; i < 7; i++) {
    const x = 4.4 + i * 0.68;
    const bounce = cheering ? Math.abs(Math.sin(t * 7 + i)) * 0.25 : Math.sin(t * 1.5 + i) * 0.02;
    const y = 1.35 + bounce;
    r.roundRect(x - 0.2, y - 0.85, x + 0.2, y, 0.12, colours[i]);
    r.circle({ x, y: y + 0.2 }, 0.17, i % 3 === 0 ? "#c98e62" : i % 3 === 1 ? "#f2c79b" : "#8a5a3c");
    // Hands pressed on the glass, or up in the air.
    const hy = cheering ? y + 0.55 + Math.sin(t * 9 + i) * 0.1 : y - 0.2;
    r.circle({ x: x - 0.22, y: hy }, 0.06, "#f2c79b");
    r.circle({ x: x + 0.22, y: hy }, 0.06, "#f2c79b");
    // Eyes: wide, watching.
    r.circle({ x: x - 0.06, y: y + 0.23 }, 0.035, "#fff");
    r.circle({ x: x + 0.06, y: y + 0.23 }, 0.035, "#fff");
    r.circle({ x: x - 0.06, y: y + 0.23 }, 0.015, "#2a2230");
    r.circle({ x: x + 0.06, y: y + 0.23 }, 0.015, "#2a2230");
    if (cheering) r.circle({ x, y: y + 0.11 }, 0.05, "#2a2230");
  }
  r.rect(4.0, 3.15, 9.0, 3.2, "#c9d4dd");
}
