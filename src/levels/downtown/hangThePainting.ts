import { OFFICE, type Level } from "../level";
import { RAPIER } from "../../physics/world";
import type { ImpulseJoint } from "@dimforge/rapier2d-deterministic-compat";
import { Curio } from "../curio";
import type { GameEvent } from "../../sim/game";

const HOOK = { x: 9.2, y: 2.55 };
const HANG_RADIUS = 0.16;
const HOLD = 1.0;

/** Downtown job 2: hang a painting on a hook, level. The hook is just out of reach. */
export const hangThePainting: Level = {
  id: "hang-the-painting",
  title: "Hang the Painting",
  goal: "Hang the painting on the hook. Level, please.",
  icon: "🖼️",
  par: [25, 60],
  bounds: { w: 12, h: 4.6 },
  spawn: { x: 1.5, y: 0 },
  target: HOOK,
  theme: { ...OFFICE, top: "#efe9e1", bottom: "#ddd4c8", floor: "#7a5a40", floorTop: "#9a7552" },
  build(kit) {
    kit.enclosure(12, 4.6);
    const painting = kit.box(4.2, 0.36, 0.48, 0.34, { kind: "painting", density: 4, friction: 0.7, color: "#c9a36a" });
    kit.box(6.4, 0.25, 0.3, 0.25, { kind: "stool", density: 6, friction: 0.9, color: "#9a6b4a" });
    kit.fragile(7.7, 0, "vase");
    const art = new Curio("art", "\"Untitled #4.\" The gallery says it's about the human condition. It's a beige square.", { x0: 1.8, y0: 2.0, x1: 3.0, y1: 3.2 });
    let joint: ImpulseJoint | null = null;
    let level = 0;

    /** The point on the painting the wire hangs from (top centre, a little in). */
    const wirePoint = () => {
      const p = painting.body.translation();
      const a = painting.body.rotation();
      return { x: p.x - Math.sin(a) * (painting.hh - 0.06), y: p.y + Math.cos(a) * (painting.hh - 0.06) };
    };

    return {
      update(game, dt) {
        const ev: GameEvent[] = [...art.update(game, dt)];
        const held = game.held.has(painting.body);
        const w = wirePoint();
        if (!joint && !held && Math.hypot(w.x - HOOK.x, w.y - HOOK.y) < HANG_RADIUS) {
          // On the hook: the wire catches and it swings from there.
          const data = RAPIER.JointData.revolute({ x: HOOK.x, y: HOOK.y }, { x: 0, y: painting.hh - 0.06 });
          joint = game.world.createImpulseJoint(data, kit.room, painting.body, true);
          // A bit of friction at the wire so it swings and then settles.
          painting.body.setAngularDamping(2.5);
          ev.push({ type: "score", text: "Hooked!", pos: { x: HOOK.x, y: HOOK.y + 0.4 } });
        } else if (joint && held && Math.hypot(w.x - HOOK.x, w.y - HOOK.y) > 0.25) {
          game.world.removeImpulseJoint(joint, true);
          joint = null;
          painting.body.setAngularDamping(0.2);
        }
        const still = Math.abs(painting.body.angvel()) < 0.15;
        level = joint && !held && still && Math.abs(painting.body.rotation()) < 0.08 ? level + dt : 0;
        return ev;
      },
      progress: () => {
        if (level >= HOLD) return { done: true, label: "Perfect." };
        if (joint) return { done: false, label: level > 0 ? "Level…" : "Let it settle…" };
        return { done: false, label: "Painting → hook" };
      },
      drawBack(r) {
        // Gallery wall: a spotlight on the empty spot, and some existing "art".
        r.poly([{ x: HOOK.x - 0.15, y: 4.6 }, { x: HOOK.x + 0.15, y: 4.6 }, { x: HOOK.x + 0.9, y: 1.5 }, { x: HOOK.x - 0.9, y: 1.5 }], "rgba(255,248,220,0.45)");
        r.rect(1.8, 2.0, 3.0, 3.2, "#8a6a4e");
        r.rect(1.9, 2.1, 2.9, 3.1, "#e8dcc4");
        r.rect(5.0, 2.3, 5.7, 3.0, "#8a6a4e");
        r.rect(5.06, 2.36, 5.64, 2.94, "#3b6ea8");
        r.circle({ x: 5.35, y: 2.65 }, 0.15, "#f2c94c");
        r.text("PLEASE DO NOT TOUCH", { x: 2.4, y: 1.8 }, 0.08, "#5b4b3a");
        // The hook.
        r.circle({ x: HOOK.x, y: HOOK.y }, 0.04, "#5b4b3a");
        r.line({ x: HOOK.x, y: HOOK.y }, { x: HOOK.x + 0.04, y: HOOK.y + 0.08 }, 0.025, "#5b4b3a");
      },
      drawMid(r) {
        // The wire, when hanging.
        if (!joint) return;
        const w = wirePoint();
        const a = painting.body.rotation();
        const cx = painting.hw * 0.7;
        const left = { x: w.x - Math.cos(a) * cx, y: w.y - Math.sin(a) * cx - 0.04 };
        const right = { x: w.x + Math.cos(a) * cx, y: w.y + Math.sin(a) * cx - 0.04 };
        r.line(left, HOOK, 0.012, "#5b4b3a");
        r.line(right, HOOK, 0.012, "#5b4b3a");
      },
    };
  },
};
