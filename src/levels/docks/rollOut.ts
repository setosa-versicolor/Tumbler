import { HARBOUR, type Level } from "../level";
import type { Prop } from "../kit";
import { Curio } from "../curio";

const DOCK_Y = 1.0;
const HOLD = { x0: 11, x1: 13.5 };
const NEEDED = 2;

/** Docks job 3: roll two heavy barrels into the ship's hold. There's a bollard in the way. */
export const rollOut: Level = {
  id: "roll-out",
  title: "Roll Out the Barrels",
  goal: `Get ${NEEDED} barrels down into the hold.`,
  icon: "🛢️",
  par: [25, 60],
  bounds: { w: 16, h: 7 },
  spawn: { x: 1.5, y: DOCK_Y },
  target: { x: (HOLD.x0 + HOLD.x1) / 2, y: DOCK_Y },
  theme: HARBOUR,
  build(kit) {
    kit.enclosure(16, 7, true);
    kit.solid(HOLD.x0 / 2, DOCK_Y / 2, HOLD.x0 / 2, DOCK_Y / 2, "dock");
    kit.solid((HOLD.x1 + 16) / 2, DOCK_Y / 2, (16 - HOLD.x1) / 2, DOCK_Y / 2, "dock");
    // A mooring bollard: barrels won't roll over it on their own.
    kit.solid(7.2, DOCK_Y + 0.2, 0.16, 0.2, "post");
    kit.fragile(9.3, DOCK_Y, "bottles");
    const barrels: Prop[] = [3.2, 4.6].map((x) => kit.ball(x, DOCK_Y + 0.33, 0.32, { kind: "barrel", density: 12, friction: 0.8, restitution: 0.1, color: "#9a6b4a" }));
    const bottle = new Curio("message", "A message in a bottle: \"Help. I'm stuck in a temp job. — G.T., age 19\"", { x0: 12.0, y0: 0, x1: 12.6, y1: 0.3 }, 0.5);

    const inHold = () => barrels.filter((b) => {
      const p = b.body.translation();
      return p.x > HOLD.x0 && p.x < HOLD.x1 && p.y < DOCK_Y;
    }).length;
    let last = 0;
    return {
      progress: () => {
        const n = Math.min(inHold(), NEEDED);
        return { done: n >= NEEDED, label: `Barrels in the hold ${n}/${NEEDED}` };
      },
      update(game, dt) {
        const n = inHold();
        const ev = n > last ? [{ type: "score" as const, text: "THUNK!", pos: { x: 12.25, y: 1.6 } }] : [];
        last = n;
        return [...ev, ...bottle.update(game, dt)];
      },
      drawBack(r) {
        // The hold: dark inside, a hatch frame, a ladder painted on (purely decorative; you'll have to jump).
        r.rect(HOLD.x0, 0, HOLD.x1, DOCK_Y, "#3a3530");
        for (let y = 0.2; y < DOCK_Y; y += 0.25) r.rect(HOLD.x0, y, HOLD.x1, y + 0.02, "rgba(255,255,255,0.05)");
        r.rect(HOLD.x0 - 0.08, DOCK_Y - 0.06, HOLD.x0, DOCK_Y, "#f2c94c");
        r.rect(HOLD.x1, DOCK_Y - 0.06, HOLD.x1 + 0.08, DOCK_Y, "#f2c94c");
        // The bottle on the floor of the hold.
        r.roundRect(12.15, 0.02, 12.45, 0.12, 0.04, "rgba(143,199,217,0.85)");
        r.rect(12.43, 0.05, 12.52, 0.09, "#b9895a");
        r.rect(12.22, 0.05, 12.36, 0.09, "#f4efe6");
        // Stacked cargo on the far side.
        r.rect(14.0, DOCK_Y, 15.2, DOCK_Y + 0.9, "#7a8c9a");
        r.rect(14.3, DOCK_Y + 0.9, 15.0, DOCK_Y + 1.6, "#9a6b4a");
        r.text("CARGO", { x: 14.6, y: DOCK_Y + 0.45 }, 0.18, "rgba(255,255,255,0.8)");
      },
    };
  },
};
