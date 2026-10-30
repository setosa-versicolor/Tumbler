import { OFFICE, type Level } from "../level";
import type { Prop } from "../kit";
import { Curio, inRect } from "../curio";
import type { GameEvent } from "../../sim/game";

const W = 15;
const EXIT_X = 12.6;
const ASSEMBLY = { x0: 13.0, x1: W };
const NEEDED = 3;

/** Skyscraper job 4: get the training mannequins out of the fire exit. They are not helping. */
export const fireDrill: Level = {
  id: "fire-drill",
  title: "Fire Drill",
  goal: `Get all ${NEEDED} training mannequins out to the assembly point.`,
  icon: "🚨",
  par: [35, 80],
  bounds: { w: W, h: 4.6 },
  spawn: { x: 1.2, y: 0 },
  target: { x: (ASSEMBLY.x0 + ASSEMBLY.x1) / 2, y: 1.0 },
  theme: { ...OFFICE, top: "#eadede", bottom: "#d8c8c8" },
  build(kit) {
    kit.enclosure(W, 4.6);
    // The wall with the fire exit in it.
    kit.solid(EXIT_X, 3.4, 0.1, 1.2, "partition");
    const dummies: Prop[] = [3.2, 6.4, 9.6].map((x, i) =>
      kit.box(x, i === 1 ? 0.17 : 0.51, 0.16, 0.5, { kind: "dummy", density: 5, friction: 0.8, color: "#e6c9a4", angle: i === 1 ? Math.PI / 2 : 0 }),
    );
    kit.fragile(7.9, 0, "planter");
    const glass = new Curio("break-glass", "It says 'break glass.' You've had a lot of practice.", { x0: 4.6, y0: 1.5, x1: 5.1, y1: 2.0 });
    let smashed = false;
    const out = () => dummies.filter((d) => d.body.translation().x > ASSEMBLY.x0).length;

    let last = 0;
    return {
      update(game) {
        const ev: GameEvent[] = [];
        const n = out();
        if (n > last) ev.push({ type: "score", text: "Evacuated!", pos: { x: 13.9, y: 2.2 } });
        last = n;
        if (!smashed) {
          const hit = [game.stanley.rig.arms.L.hand, game.stanley.rig.arms.R.hand].some((h) => {
            const v = h.linvel();
            return inRect(h.translation(), glass.rect) && Math.hypot(v.x, v.y) > 1.2;
          });
          if (hit) {
            smashed = true;
            ev.push(glass.reveal());
          }
        }
        return ev;
      },
      progress: () => {
        const n = out();
        return { done: n >= NEEDED, label: `Evacuated ${n}/${NEEDED}` };
      },
      drawBack(r, game) {
        // Alarm light, exit sign, the break-glass box, cubicles; outside, the assembly point.
        const on = Math.floor(game.time * 3) % 2 === 0;
        r.circle({ x: 6.5, y: 4.2 }, 0.16, on ? "#ff5a4f" : "#8a3a3a");
        if (on) r.circle({ x: 6.5, y: 4.2 }, 0.5, "rgba(255,90,79,0.15)");
        r.rect(EXIT_X - 0.9, 2.5, EXIT_X - 0.15, 2.85, "#2e9b5a");
        r.text("EXIT →", { x: EXIT_X - 0.52, y: 2.67 }, 0.12, "#fff");
        r.rect(glass.rect.x0, glass.rect.y0, glass.rect.x1, glass.rect.y1, "#c0392b");
        r.rect(glass.rect.x0 + 0.06, glass.rect.y0 + 0.06, glass.rect.x1 - 0.06, glass.rect.y1 - 0.06, smashed ? "#5a2020" : "rgba(220,240,250,0.8)");
        r.text("BREAK GLASS", { x: (glass.rect.x0 + glass.rect.x1) / 2, y: glass.rect.y0 - 0.1 }, 0.06, "#c0392b");
        for (const x of [2.2, 5.4, 8.6]) r.rect(x, 0, x + 1.2, 1.15, "rgba(122,130,140,0.3)");
        r.rect(EXIT_X + 0.1, 0, W, 4.6, "#cfe0ec");
        r.rect(ASSEMBLY.x0, 0, ASSEMBLY.x1, 0.04, "#2e9b5a");
        r.rect(13.6, 0, 13.66, 1.8, "#5f6670");
        r.rect(13.3, 1.5, 14.6, 2.0, "#2e9b5a");
        r.text("ASSEMBLY POINT", { x: 13.95, y: 1.75 }, 0.1, "#fff");
      },
    };
  },
};
