import { OFFICE, type Level } from "../level";
import type { Prop } from "../kit";
import { Curio, inRect } from "../curio";
import type { GameEvent } from "../../sim/game";

const DESK = { x0: 1.8, x1: 3.4, top: 0.75 };
const SHREDDER = { x0: 8.6, x1: 9.5, top: 0.95 };
const MOUTH = { x0: SHREDDER.x0 + 0.05, y0: SHREDDER.top - 0.05, x1: SHREDDER.x1 - 0.05, y1: SHREDDER.top + 0.25 };
const FAN = { x0: 5.0, x1: 7.2, y0: 0.4, y1: 2.6, push: -5 };
const NEEDED = 4;

/** Skyscraper job 3: shred four sheets of paper. Paper flutters. There's a fan. */
export const shredIt: Level = {
  id: "shred-it",
  title: "Shred It",
  goal: `Feed ${NEEDED} sheets of paper into the shredder.`,
  icon: "🗃️",
  par: [30, 75],
  bounds: { w: 11, h: 4.6 },
  spawn: { x: 1.0, y: 0 },
  target: { x: (SHREDDER.x0 + SHREDDER.x1) / 2, y: SHREDDER.top + 0.3 },
  theme: OFFICE,
  build(kit) {
    kit.enclosure(11, 4.6);
    kit.solid((DESK.x0 + DESK.x1) / 2, DESK.top / 2, (DESK.x1 - DESK.x0) / 2, DESK.top / 2, "desk");
    kit.solid((SHREDDER.x0 + SHREDDER.x1) / 2, SHREDDER.top / 2, (SHREDDER.x1 - SHREDDER.x0) / 2, SHREDDER.top / 2, "shredder");
    const papers: Prop[] = [];
    for (let i = 0; i < 6; i++) {
      const p = kit.box(2.6 + (kit.rand() - 0.5) * 0.3, DESK.top + 0.02 + i * 0.045, 0.16, 0.02, { kind: "paper", density: 3, friction: 0.5, color: "#fbfbf7", angle: (kit.rand() - 0.5) * 0.1 });
      // Paper drifts and flutters.
      p.body.setLinearDamping(2.2);
      p.body.setAngularDamping(1.2);
      papers.push(p);
    }
    kit.fragile(4.4, 0, "trophy");
    const plan = new Curio("succession", "Every draft has the same name on it. It's been covered with a Post-it.", { x0: 6.6, y0: 2.9, x1: 7.6, y1: 3.8 }, 0.5);
    let shredded = 0;

    return {
      update(game, dt) {
        const ev: GameEvent[] = [];
        for (const p of game.props) {
          const q = p.body.translation();
          // The fan pushes light things back the way they came.
          if (inRect(q, FAN) && p.body.mass() < 0.5) p.body.applyImpulse({ x: FAN.push * p.body.mass() * dt, y: 0.6 * p.body.mass() * dt }, true);
          if (p.kind === "paper" && inRect(q, MOUTH)) {
            game.removeProp(p);
            shredded++;
            ev.push({ type: "score", text: "SHRED!", pos: { x: q.x, y: q.y + 0.5 } });
          }
        }
        return [...ev, ...plan.update(game, dt)];
      },
      progress: () => ({ done: shredded >= NEEDED, label: `Shredded ${Math.min(shredded, NEEDED)}/${NEEDED}` }),
      drawBack(r, game) {
        // The fan on its stand, blowing (with little wind lines).
        r.rect(7.7, 0, 7.78, 1.3, "#7a828c");
        r.circle({ x: 7.74, y: 1.45 }, 0.3, "#c9ccd1");
        r.circle({ x: 7.74, y: 1.45 }, 0.06, "#5f6670");
        for (let i = 0; i < 4; i++) {
          const t = (game.time * 1.4 + i * 0.25) % 1;
          r.line({ x: 7.3 - t * 2.2, y: 0.8 + i * 0.45 }, { x: 7.0 - t * 2.2, y: 0.8 + i * 0.45 }, 0.015, `rgba(120,140,160,${0.5 * (1 - t)})`);
        }
        // The succession plan, framed.
        r.rect(6.6, 2.9, 7.6, 3.8, "#5b4b3a");
        r.rect(6.68, 2.98, 7.52, 3.72, "#fbfbf7");
        r.text("SUCCESSION PLAN", { x: 7.1, y: 3.6 }, 0.07, "#2a2230");
        r.text("DRAFT 47", { x: 7.1, y: 3.47 }, 0.06, "#c0392b");
        r.rect(6.85, 3.15, 7.35, 3.35, "#f2c94c");
        r.text("CONFIDENTIAL", { x: 9.0, y: 2.0 }, 0.1, "#c0392b");
      },
    };
  },
};
