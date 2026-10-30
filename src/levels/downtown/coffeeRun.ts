import { OFFICE, type Level } from "../level";
import { toward } from "../../sim/math";
import { Curio } from "../curio";

const COUNTER = { x0: 0.2, x1: 1.8, top: 0.95 };
const DESK = { x0: 11.4, x1: 13.4, top: 0.78 };
const NEEDED = 3;

/** Downtown job 4: carry a tray of coffees across the office without spilling. */
export const coffeeRun: Level = {
  id: "coffee-run",
  title: "Coffee Run",
  goal: `Get ${NEEDED} coffees to the desk on the tray. Don't spill.`,
  icon: "☕",
  par: [25, 55],
  bounds: { w: 14, h: 4.6 },
  spawn: { x: 2.7, y: 0 },
  target: { x: (DESK.x0 + DESK.x1) / 2, y: DESK.top + 0.4 },
  theme: OFFICE,
  build(kit) {
    kit.enclosure(14, 4.6);
    kit.solid((COUNTER.x0 + COUNTER.x1) / 2, COUNTER.top / 2, (COUNTER.x1 - COUNTER.x0) / 2, COUNTER.top / 2, "counter");
    kit.solid((DESK.x0 + DESK.x1) / 2, DESK.top / 2, (DESK.x1 - DESK.x0) / 2, DESK.top / 2, "desk");
    const trayY = COUNTER.top + 0.025;
    // The tray sits at the front of the counter, within reach.
    const trayX = COUNTER.x1 - 0.36;
    const tray = kit.tray(trayX, trayY, 0.34);
    for (const dx of [-0.225, -0.075, 0.075, 0.225]) kit.fragile(trayX + dx, trayY + 0.025, "cup");
    kit.fragile(7.0, 0, "lamp");
    const copier = new Curio("copier", "The photocopier has made a copy of your face. Forty copies, actually.", { x0: 4.3, y0: 0, x1: 5.3, y1: 1.1 });

    return {
      update: (game, dt) => copier.update(game, dt),
      progress: (game) => {
        const left = game.props.filter((p) => p.kind === "cup");
        const trayDown = !game.held.has(tray.body);
        const served = left.filter((c) => {
          const q = c.body.translation();
          const v = c.body.linvel();
          // On the desk, or on the tray resting on the desk's edge.
          return trayDown && q.x > DESK.x0 - 0.4 && q.x < DESK.x1 && q.y > DESK.top && q.y < DESK.top + 0.4 && Math.hypot(v.x, v.y) < 0.15;
        }).length;
        if (left.length < NEEDED) return { done: false, label: "Out of coffee. Restart ↺" };
        return { done: served >= NEEDED, label: `Coffees served ${Math.min(served, NEEDED)}/${NEEDED} · ${left.length} left` };
      },
      drawBack(r, game) {
        // Kitchenette, the photocopier, cubicle walls, the boss's assistant's desk.
        r.rect(COUNTER.x0, COUNTER.top + 0.6, COUNTER.x1, COUNTER.top + 1.4, "#c9ccd1");
        r.rect(COUNTER.x0 + 0.1, COUNTER.top + 0.7, COUNTER.x0 + 0.7, COUNTER.top + 1.3, "#e8eaed");
        r.text("KITCHEN", { x: (COUNTER.x0 + COUNTER.x1) / 2, y: COUNTER.top + 1.7 }, 0.14, "#5f6670");
        r.roundRect(4.3, 0, 5.3, 1.0, 0.05, "#e8eaed");
        r.rect(4.35, 1.0, 5.25, 1.08, "#9aa0a8");
        r.rect(4.5, 0.65, 4.9, 0.72, "#5d9de8");
        r.text("COPY", { x: 4.8, y: 0.35 }, 0.1, "#5f6670");
        // Coworkers pop up over the cubicle walls to watch the coffee go by.
        const head = game.stanley.rig.head.translation();
        [6.9, 9.3].forEach((x, i) => {
          const up = Math.max(0, Math.sin(game.time * 0.8 + i * 2.1)) * 0.3;
          const face = { x, y: 1.0 + up };
          r.circle(face, 0.17, i ? "#8a5a3c" : "#f2c79b");
          r.rect(x - 0.17, face.y + 0.06, x + 0.17, face.y + 0.16, i ? "#2a2230" : "#c58be8");
          for (const dx of [-0.06, 0.06]) {
            const e = { x: x + dx, y: face.y };
            r.circle(e, 0.035, "#fff");
            r.circle(toward(e, head, 0.015), 0.016, "#2a2230");
          }
        });
        for (const x of [6.2, 8.6]) r.rect(x, 0, x + 1.4, 1.2, "rgba(150,158,168,0.92)");
        r.rect(DESK.x0 + 0.3, DESK.top + 0.05, DESK.x0 + 0.9, DESK.top + 0.5, "#2a2230");
        r.rect(DESK.x0 + 0.33, DESK.top + 0.08, DESK.x0 + 0.87, DESK.top + 0.47, "#5d9de8");
        r.text("RECEPTION", { x: (DESK.x0 + DESK.x1) / 2, y: 2.4 }, 0.16, "#5f6670");
      },
    };
  },
};
