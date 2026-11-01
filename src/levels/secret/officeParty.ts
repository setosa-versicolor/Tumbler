import { OFFICE, type Level } from "../level";
import type { Prop } from "../kit";
import type { GameEvent } from "../../sim/game";
import type { Renderer } from "../../render/renderer";
import type { Vec } from "../../sim/math";
import { RAPIER } from "../../physics/world";
import { BOSS, drawBoss } from "../../story/office";
import { drawKnight } from "./yeOldeJob";
import { drawCoworkerHead, drawGoat, drawGoblin, drawHenderson, drawMom, drawRabbit } from "../../render/characters";

const W = 16;
const H = 4.6;
/** The open door, far right: out through here goes everybody. */
export const DOOR = { x: W - 0.9, top: 2.4 };
const DISCOS = [4.6, 9.8];
const DISCO = { top: H, y: 2.85, r: 0.22 };

type Who = "gerald" | "henderson" | "knight" | "goat" | "goblin" | "rabbit" | "mannequin" | "coworker" | "mom";

/** Everyone you've met, dancing: sized to how they're drawn, and what they say on the way out. */
export const GUESTS: { who: Who; x: number; hw: number; hh: number; bye: string }[] = [
  { who: "gerald", x: 3.3, hw: 0.32, hh: 1.0, bye: "Say hi to your mother!" },
  { who: "mom", x: 4.2, hw: 0.3, hh: 0.92, bye: "Bye, sweetie!" },
  { who: "henderson", x: 5.6, hw: 0.28, hh: 0.9, bye: "I still want a doorbell!" },
  { who: "goat", x: 6.6, hw: 0.36, hh: 0.42, bye: "Meh." },
  { who: "knight", x: 7.7, hw: 0.3, hh: 1.0, bye: "Thou art a better fit!" },
  { who: "coworker", x: 8.9, hw: 0.22, hh: 0.85, bye: "Is that really the way you should be doing that?" },
  { who: "goblin", x: 10.6, hw: 0.18, hh: 0.4, bye: "I'll be under the floor." },
  { who: "rabbit", x: 11.4, hw: 0.17, hh: 0.17, bye: "*plop*" },
  { who: "mannequin", x: 12.4, hw: 0.16, hh: 0.5, bye: "…" },
];

const PARTY = { ...OFFICE, top: "#3d3758", bottom: "#2e2a44", floor: "#4a4560", floorTop: "#5f5a78", stripe: "rgba(255,255,255,0.03)" };

/** The very end (every job, five stars): the office party. Everybody out, then cake. Well, a hat. */
export const officeParty: Level = {
  id: "office-party",
  title: "The Office Party",
  goal: "Party's over. Get everyone out the door.",
  icon: "🎉",
  par: [90, 180],
  bounds: { w: W, h: H },
  spawn: { x: 1.4, y: 0 },
  target: { x: DOOR.x, y: 1.2 },
  theme: PARTY,
  build(kit) {
    kit.enclosure(W, H);
    // The wall with the door in it.
    kit.solid(DOOR.x, (DOOR.top + H) / 2, 0.08, (H - DOOR.top) / 2, "partition");

    // Disco balls, to swing from (as at the bowling alley).
    const discos = DISCOS.map((x) => {
      const d = kit.ball(x, DISCO.y, DISCO.r, { kind: "discoball", density: 250, color: "#c9ccd1", restitution: 0.1 });
      kit.world.createImpulseJoint(RAPIER.JointData.revolute({ x, y: DISCO.top }, { x: 0, y: DISCO.top - DISCO.y }), kit.room, d.body, true);
      d.body.setAngularDamping(0.4);
      return { x, prop: d };
    });

    const guests = GUESTS.map((g, i) => {
      // (The mannequin is the Fire Drill's own: the renderer draws it.)
      const kind = g.who === "mannequin" ? "dummy" : "guest";
      const prop = kit.box(g.x, g.hh + 0.01, g.hw, g.hh, { kind, density: 1.8, friction: 0.9, color: "#e6c9a4", tag: g.who });
      return { ...g, prop, gone: false, phase: i * 0.7 };
    });
    let left = guests.length;
    let hatAt = -1;

    return {
      update(game, dt) {
        const ev: GameEvent[] = [];
        for (const g of guests) {
          if (g.gone) continue;
          const b = g.prop.body;
          const q = b.translation();
          // Out the door (their leading end well through it, so feet first, lying
          // down, counts too: there's no room past the door for a long guest's middle):
          // gone, with a parting word.
          const a = b.rotation();
          const reach = q.x + Math.abs(Math.cos(a)) * g.hw + Math.abs(Math.sin(a)) * g.hh;
          if (reach > DOOR.x + 0.55) {
            g.gone = true;
            left--;
            ev.push({ type: "score", text: g.bye, pos: { x: DOOR.x - 0.6, y: 2.6 } });
            game.removeProp(g.prop);
            if (left === 0) hatAt = game.time;
            continue;
          }
          if (game.held.has(b)) continue;
          // Dancing: a bob now and then, and they right themselves (they're not
          // falling over at a party; not this early, anyway).
          const m = b.mass();
          b.applyTorqueImpulse((-b.rotation() * 5 - b.angvel() * 0.8) * m * g.hh * dt, true);
          g.phase += dt;
          if (g.phase > 0.9 && Math.abs(b.linvel().y) < 0.05) {
            g.phase = game.rand() * 0.4;
            b.applyImpulse({ x: (game.rand() - 0.5) * 0.6 * m, y: (0.9 + game.rand() * 0.6) * m }, true);
          }
        }
        return ev;
      },
      progress: (game) => ({
        done: hatAt >= 0 && game.time - hatAt > 3,
        label: left > 0 ? `Guests still here: ${left}` : "🎉 Party's over.",
      }),
      drawBack(r, game) {
        // Party lights, streamers, the banner, balloons, the cake.
        for (let i = 0; i < 8; i++) {
          const sx = ((game.time * 0.3 + i * 0.29) % 1) * W;
          const sy = 1.0 + ((i * 0.53) % 1) * 3;
          r.circle({ x: sx, y: sy }, 0.35, ["rgba(232,93,157,0.18)", "rgba(93,232,200,0.18)", "rgba(242,201,76,0.18)"][i % 3]);
        }
        for (let x = 0.2; x < DOOR.x - 0.3; x += 0.8) {
          r.poly([{ x, y: H - 0.05 }, { x: x + 0.4, y: H - 0.45 }, { x: x + 0.8, y: H - 0.05 }], ["#e85d9d", "#5dd5c8", "#f2c94c"][Math.round(x * 10) % 3]);
        }
        r.rect(5.2, 3.35, 9.8, 3.85, "#f4efe1");
        r.text("WELL DONE, STANLEY. (GENUINELY.)", { x: 7.5, y: 3.6 }, 0.17, "#c0392b");
        for (const [x, c] of [[1.0, "#e85d5d"], [1.4, "#5d9de8"], [13.3, "#f2c94c"], [13.7, "#7bc96f"]] as const) {
          const bob = Math.sin(game.time * 1.5 + x) * 0.05;
          r.line({ x, y: 1.2 }, { x, y: 2.5 + bob }, 0.01, "#9aa0a8");
          r.circle({ x, y: 2.7 + bob }, 0.2, c);
        }
        r.rect(1.9, 0, 2.9, 0.75, "#6b4a3a");
        r.roundRect(2.05, 0.75, 2.75, 1.05, 0.05, "#f4efe1");
        r.rect(2.05, 0.88, 2.75, 0.92, "#e85d9d");
        r.rect(2.38, 1.05, 2.42, 1.2, "#f2c94c");
        // The door, wide open, and the dark corridor beyond.
        r.rect(DOOR.x + 0.08, 0, W, DOOR.top, "#1b1828");
        r.rect(DOOR.x - 0.35, 2.5, DOOR.x + 0.25, 2.85, "#2e9b5a");
        r.text("EXIT →", { x: DOOR.x - 0.05, y: 2.67 }, 0.12, "#fff");
        r.poly([{ x: DOOR.x + 0.08, y: 0 }, { x: DOOR.x + 0.55, y: 0.15 }, { x: DOOR.x + 0.55, y: DOOR.top - 0.15 }, { x: DOOR.x + 0.08, y: DOOR.top }], "#8a6a4e");
        // Disco ball rods.
        for (const d of discos) r.line({ x: d.x, y: DISCO.top }, d.prop.body.translation(), 0.015, "#9aa0a8");
      },
      drawMid(r, game) {
        const look = game.stanley.rig.head.translation();
        for (const g of guests) if (!g.gone && g.who !== "mannequin") drawGuest(r, g.who, g.prop, game.time, look);
      },
      drawFront(r, game) {
        // The party hat, once everyone's gone.
        if (hatAt < 0) return;
        const head = game.stanley.rig.head;
        const p = head.translation();
        const a = head.rotation();
        const pop = Math.min(1, (game.time - hatAt) * 3);
        const at = (x: number, y: number): Vec => ({ x: p.x + x * Math.cos(a) - y * Math.sin(a), y: p.y + x * Math.sin(a) + y * Math.cos(a) });
        r.poly([at(-0.15, 0.16), at(0.15, 0.16), at(0, 0.16 + 0.45 * pop)], "#e85d9d");
        r.poly([at(-0.1, 0.25), at(0.1, 0.25), at(0.06, 0.33), at(-0.06, 0.33)], "#f2c94c");
        r.circle(at(0, 0.18 + 0.45 * pop), 0.06, "#f2c94c");
      },
    };
  },
};

/**
 * Draw a guest on their (dancing, possibly flying) body, with the very same
 * drawing as in their own scene, moved onto the body's feet and turned with it.
 * (Gerald, Mrs. Henderson and the coworker had only been seen from the waist
 * up: below that's new, in the same style.)
 */
function drawGuest(r: Renderer, who: Who, prop: Prop, t: number, look: Vec) {
  const p = prop.body.translation();
  const a = prop.body.rotation();
  const feet = { x: p.x + Math.sin(a) * prop.hh, y: p.y - Math.cos(a) * prop.hh };
  const f = look.x > p.x ? 1 : -1;
  const at = (native: Vec, fn: () => void) => r.place(native, feet, a, fn);
  switch (who) {
    case "gerald":
      // Gerald, as at his desk (he faces left there), and the legs that were under it.
      at({ x: BOSS.x, y: 0 }, () => {
        r.rect(BOSS.x - 0.22, 0, BOSS.x - 0.04, 0.88, "#3a404d");
        r.rect(BOSS.x + 0.04, 0, BOSS.x + 0.22, 0.88, "#3a404d");
        r.roundRect(BOSS.x - 0.26, 0, BOSS.x - 0.02, 0.07, 0.03, "#2a2230");
        r.roundRect(BOSS.x + 0.02, 0, BOSS.x + 0.26, 0.07, 0.03, "#2a2230");
        drawBoss(r, false, t, false);
      });
      break;
    case "mom":
      at({ x: 0, y: 0 }, () => drawMom(r, 0, 0, -f));
      break;
    case "henderson":
      // As at her window (the sill's at her waist), and the rest of her.
      at({ x: 0, y: 0 }, () => {
        r.rect(-0.12, 0, -0.03, 0.5, "#f2c79b");
        r.rect(0.03, 0, 0.12, 0.5, "#f2c79b");
        r.poly([{ x: -0.32, y: 0.45 }, { x: 0.32, y: 0.45 }, { x: 0.28, y: 1.0 }, { x: -0.28, y: 1.0 }], "#c58be8");
        drawHenderson(r, 0, 1.0);
      });
      break;
    case "knight":
      at({ x: 0, y: 0 }, () => drawKnight(r, { x: 0, face: f, swing: 0, flash: 0, phase: "advance", hp: 5, guard: 1.2, clang: 0 }, 0, true));
      break;
    case "goat":
      at({ x: 0.07, y: 0 }, () => drawGoat(r, 0));
      break;
    case "coworker":
      // The coworker who peeks over the cubicle wall, all of them for once.
      at({ x: 0, y: 0 }, () => {
        r.rect(-0.12, 0, -0.03, 0.75, "#3b4a7a");
        r.rect(0.03, 0, 0.12, 0.75, "#3b4a7a");
        r.roundRect(-0.22, 0.7, 0.22, 1.32, 0.1, "#2a2230");
        for (const s of [-1, 1]) r.circle({ x: s * 0.27, y: 1.15 + Math.sin(t * 6 + s) * 0.12 }, 0.05, "#f2c79b");
        drawCoworkerHead(r, 0, 1.5, "#f2c79b", "#c58be8", look);
      });
      break;
    case "goblin":
      at({ x: 0, y: 0 }, () => drawGoblin(r, 0, 0, f));
      break;
    case "rabbit":
      at({ x: 0, y: 0 }, () => drawRabbit(r, 0, 0, f));
      break;
    case "mannequin":
      break;
  }
}
