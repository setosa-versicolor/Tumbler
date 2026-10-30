import { OFFICE, type Level } from "../level";
import { Curio, inRect } from "../curio";
import type { Renderer } from "../../render/renderer";

const W = 16;
const H = 4.6;
const DOOR_X = 6.0;
const DOOR_TOP = 2.15;
const VAN = { x0: 11.2, x1: 15.4, floor: 0.8, roof: 2.9 };
const RAMP = { x0: 9.4, x1: VAN.x0 };

/** Downtown job 1: get the sofa out of the office and into the van. It doesn't fit through the door overhead. */
export const movingDay: Level = {
  id: "moving-day",
  title: "Moving Day",
  goal: "Get the sofa into the moving van.",
  icon: "🛋️",
  par: [25, 60],
  bounds: { w: W, h: H },
  spawn: { x: 1.4, y: 0 },
  target: { x: (VAN.x0 + VAN.x1) / 2, y: VAN.floor + 0.6 },
  theme: OFFICE,
  build(kit) {
    kit.enclosure(W, H);
    // The office wall, with a doorway.
    kit.solid(DOOR_X, (DOOR_TOP + H) / 2, 0.12, (H - DOOR_TOP) / 2, "partition");
    // The van: cargo floor, roof, cab wall, and a ramp up to it.
    kit.solid((VAN.x0 + VAN.x1) / 2, VAN.floor / 2, (VAN.x1 - VAN.x0) / 2, VAN.floor / 2, "van");
    kit.solid((VAN.x0 + VAN.x1) / 2, VAN.roof + 0.08, (VAN.x1 - VAN.x0) / 2 + 0.1, 0.08, "van");
    kit.solid(VAN.x1 + 0.1, (VAN.floor + VAN.roof) / 2, 0.1, (VAN.roof - VAN.floor) / 2 + 0.1, "van");
    const len = Math.hypot(RAMP.x1 - RAMP.x0, VAN.floor);
    const angle = Math.atan2(VAN.floor, RAMP.x1 - RAMP.x0);
    kit.solid((RAMP.x0 + RAMP.x1) / 2, VAN.floor / 2 - 0.03, len / 2, 0.04, "vanramp", { angle });
    const sofa = kit.box(3.6, 0.3, 0.75, 0.28, { kind: "sofa", density: 5, friction: 0.8, color: "#c0504d" });
    kit.fragile(7.6, 0, "lamp");
    const horn = new Curio("horn", "HONK. The driver would like you to stop that.", { x0: VAN.x1 - 0.3, y0: 1.0, x1: W, y1: 2.2 });
    let honked = false;
    let settled = 0;

    const inVan = () => {
      const p = sofa.body.translation();
      const v = sofa.body.linvel();
      return p.x > VAN.x0 + 0.3 && p.x < VAN.x1 && p.y > VAN.floor && Math.hypot(v.x, v.y) < 0.3;
    };
    return {
      update(game, dt) {
        settled = inVan() && !game.held.has(sofa.body) ? settled + dt : 0;
        // Smack the cab and the horn goes.
        const hit = [game.stanley.rig.arms.L.hand, game.stanley.rig.arms.R.hand].some((h) => {
          const v = h.linvel();
          return inRect(h.translation(), { x0: VAN.x1 - 0.1, y0: VAN.floor, x1: W, y1: VAN.roof }) && Math.hypot(v.x, v.y) > 1.2;
        });
        if (hit && !honked) {
          honked = true;
          return [{ ...horn.reveal(), pos: { x: VAN.x1 - 0.6, y: VAN.roof + 0.4 } }];
        }
        return [];
      },
      progress: () => ({ done: settled > 0.6, label: settled > 0 ? "Loaded!" : "Sofa → van" }),
      drawBack(r) {
        // Office side: a window onto the street, a desk, a motivational poster.
        r.rect(1.0, 1.4, 3.0, 3.2, "#9fc4dd");
        r.rect(1.97, 1.4, 2.03, 3.2, "#f4f4f4");
        r.rect(3.6, 2.2, 4.5, 3.3, "#2a3a5a");
        r.text("TEAMWORK", { x: 4.05, y: 3.1 }, 0.12, "#f2c94c");
        r.text("(lift with", { x: 4.05, y: 2.7 }, 0.08, "#fff");
        r.text("your legs)", { x: 4.05, y: 2.55 }, 0.08, "#fff");
        // Street side: pavement, a lamp-post, a skyline.
        r.rect(DOOR_X + 0.12, 0, W, H, "#cfe0ec");
        for (const [x, h] of [[7.2, 2.4], [8.1, 3.4], [9.2, 2.8], [10.4, 3.6]] as const) r.rect(x - 0.4, 0, x + 0.4, h, "#a9bccb");
        r.rect(DOOR_X + 0.12, 0, W, 0.06, "#9a9fa6");
        // The van's body and cab.
        r.rect(VAN.x0, VAN.floor, VAN.x1, VAN.roof, "rgba(244,239,230,0.35)");
        r.roundRect(VAN.x1, 0.3, W + 0.4, 2.3, 0.2, "#f4efe6");
        r.rect(VAN.x1 + 0.15, 1.4, W, 2.1, "#9fc4dd");
        drawWheels(r);
      },
      drawFront(r) {
        // Van side panel lettering, behind which the sofa disappears.
        r.text("EASY MOVERS", { x: (VAN.x0 + VAN.x1) / 2, y: VAN.roof - 0.25 }, 0.2, "rgba(59,110,168,0.9)");
      },
    };
  },
};

function drawWheels(r: Renderer) {
  for (const x of [VAN.x0 + 0.6, VAN.x1 + 0.3]) {
    r.circle({ x, y: 0.28 }, 0.28, "#2a2230");
    r.circle({ x, y: 0.28 }, 0.12, "#9a9fa6");
  }
}
