import { OFFICE, type Level } from "../level";
import type { Prop } from "../kit";
import type { GameEvent } from "../../sim/game";
import type { Renderer } from "../../render/renderer";
import type { Vec } from "../../sim/math";
import { RAPIER } from "../../physics/world";

const W = 16;
const H = 4.6;
/** The open door, far right: out through here goes everybody. */
export const DOOR = { x: W - 0.9, top: 2.4 };
const DISCOS = [4.6, 9.8];
const DISCO = { top: H, y: 2.85, r: 0.22 };

type Who = "gerald" | "henderson" | "knight" | "goat" | "goblin" | "rabbit" | "mannequin" | "coworker" | "mom";

/** Everyone you've met, dancing. Size, where they start, and what they say on the way out. */
export const GUESTS: { who: Who; x: number; hw: number; hh: number; bye: string }[] = [
  { who: "gerald", x: 3.2, hw: 0.24, hh: 0.6, bye: "Say hi to your mother!" },
  { who: "mom", x: 4.0, hw: 0.22, hh: 0.58, bye: "Bye, sweetie!" },
  { who: "henderson", x: 5.6, hw: 0.22, hh: 0.55, bye: "I still want a doorbell!" },
  { who: "goat", x: 6.6, hw: 0.3, hh: 0.22, bye: "Meh." },
  { who: "knight", x: 7.6, hw: 0.26, hh: 0.65, bye: "Thou art a better fit!" },
  { who: "coworker", x: 8.8, hw: 0.2, hh: 0.55, bye: "Is that really the way you should be doing that?" },
  { who: "goblin", x: 10.6, hw: 0.18, hh: 0.4, bye: "I'll be under the floor." },
  { who: "rabbit", x: 11.4, hw: 0.12, hh: 0.1, bye: "*plop*" },
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
      const prop = kit.box(g.x, g.hh + 0.01, g.hw, g.hh, { kind: "guest", density: 3.5, friction: 0.9, color: "#ffffff", tag: g.who });
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
          // Out the door: gone, with a parting word.
          if (q.x > DOOR.x + 0.25) {
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
        for (const g of guests) if (!g.gone) drawGuest(r, g.who, g.prop, game.time);
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

/** Draw a guest on their (dancing, possibly flying) body. */
function drawGuest(r: Renderer, who: Who, prop: Prop, t: number) {
  const p = prop.body.translation();
  const a = prop.body.rotation();
  const at = (x: number, y: number): Vec => ({ x: p.x + x * Math.cos(a) - y * Math.sin(a), y: p.y + x * Math.sin(a) + y * Math.cos(a) });
  const box = (x0: number, y0: number, x1: number, y1: number, c: string) => r.poly([at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1)], c);
  const { hw, hh } = prop;
  const wave = Math.sin(t * 6 + p.x) * 0.12;
  const arms = (c: string) => {
    r.line(at(-hw, hh * 0.3), at(-hw - 0.18, hh * 0.3 + 0.25 + wave), 0.06, c);
    r.line(at(hw, hh * 0.3), at(hw + 0.18, hh * 0.3 + 0.25 - wave), 0.06, c);
  };
  const head = (c: string, y = hh + 0.15, rad = 0.16) => r.circle(at(0, y), rad, c);
  const eyes = (y = hh + 0.17) => {
    r.circle(at(-0.05, y), 0.02, "#2a2230");
    r.circle(at(0.05, y), 0.02, "#2a2230");
  };
  switch (who) {
    case "gerald":
      box(-hw, -hh, hw, hh * 0.7, "#4a5160");
      r.poly([at(-0.05, hh * 0.7), at(0.05, hh * 0.7), at(0, hh * 0.2)], "#c0392b");
      arms("#4a5160");
      head("#eebd92");
      r.poly([at(-0.15, hh + 0.2), at(0.15, hh + 0.2), at(0.12, hh + 0.3), at(-0.12, hh + 0.3)], "#9aa0a8");
      r.ring(at(-0.06, hh + 0.15), 0.045, "#2a2230", 0.012);
      r.ring(at(0.06, hh + 0.15), 0.045, "#2a2230", 0.012);
      box(-0.08, hh + 0.05, 0.08, hh + 0.08, "#7a7f86");
      box(hw + 0.12, hh * 0.3 + 0.2 - wave, hw + 0.26, hh * 0.3 + 0.36 - wave, "#f4f4f4");
      break;
    case "mom":
      box(-hw, -hh, hw, hh * 0.7, "#ffffff");
      r.poly([at(-0.06, hh * 0.7), at(0.06, hh * 0.7), at(0, hh * 0.35)], "#5d9de8");
      arms("#ffffff");
      head("#eebd92");
      r.circle(at(0.1, hh + 0.32), 0.08, "#6b4a3a");
      r.poly([at(-0.16, hh + 0.18), at(0.16, hh + 0.2), at(0.1, hh + 0.3), at(-0.1, hh + 0.3)], "#6b4a3a");
      r.ring(at(-0.06, hh + 0.15), 0.045, "#2a2230", 0.012);
      r.ring(at(0.06, hh + 0.15), 0.045, "#2a2230", 0.012);
      break;
    case "henderson":
      box(-hw, -hh, hw, hh * 0.7, "#e8a3b5");
      arms("#e8a3b5");
      head("#f2c79b");
      for (const dx of [-0.1, 0, 0.1]) r.circle(at(dx, hh + 0.3), 0.045, "#5d9de8");
      eyes();
      break;
    case "knight":
      box(-hw, -hh, hw, hh * 0.6, "#9aa3ad");
      box(-hw * 0.7, -hh * 0.2, hw * 0.7, hh * 0.5, "#c0392b");
      arms("#9aa3ad");
      box(-0.15, hh * 0.6, 0.15, hh + 0.25, "#9aa3ad");
      box(-0.12, hh + 0.08, 0.12, hh + 0.11, "#2a2230");
      box(-0.2, hh * 0.6 + 0.12, 0.2, hh * 0.6 + 0.18, "#5f5a55");
      r.poly([at(0, hh + 0.25), at(-0.2, hh + 0.5), at(0.04, hh + 0.25)], "#e85d5d");
      break;
    case "goat":
      box(-hw, -hh, hw, hh, "#e8e2d4");
      r.circle(at(hw + 0.05, hh * 0.6), 0.12, "#e8e2d4");
      r.circle(at(hw + 0.09, hh * 0.65), 0.018, "#2a2230");
      for (const dx of [-hw * 0.7, hw * 0.6]) box(dx - 0.03, -hh - 0.12, dx + 0.03, -hh, "#6b5b45");
      break;
    case "goblin":
      box(-hw, -hh, hw, hh * 0.6, "#4f7a3a");
      arms("#7bbf5a");
      head("#7bbf5a", hh + 0.1, 0.15);
      r.poly([at(-0.12, hh + 0.15), at(-0.32, hh + 0.28), at(-0.1, hh + 0.05)], "#7bbf5a");
      r.poly([at(0.12, hh + 0.15), at(0.32, hh + 0.28), at(0.1, hh + 0.05)], "#7bbf5a");
      r.circle(at(-0.05, hh + 0.13), 0.025, "#e85d5d");
      r.circle(at(0.05, hh + 0.13), 0.025, "#e85d5d");
      break;
    case "rabbit":
      r.circle(at(0, 0), hw + 0.02, "#f4f4f4");
      box(-0.05, hh, -0.01, hh + 0.18, "#f4f4f4");
      box(0.02, hh, 0.06, hh + 0.18, "#f4f4f4");
      r.circle(at(0.06, 0.03), 0.015, "#2a2230");
      break;
    case "mannequin":
      box(-hw, -hh, hw, hh * 0.7, "#e6c9a4");
      arms("#e6c9a4");
      head("#e6c9a4");
      for (const dy of [-0.3, 0.1, 0.5]) r.circle(at(0, dy * hh), 0.02, "rgba(0,0,0,0.25)");
      break;
    case "coworker":
      box(-hw, -hh, hw, hh * 0.7, "#2a2230");
      arms("#f2c79b");
      head("#f2c79b");
      r.poly([at(-0.17, hh + 0.15), at(0.17, hh + 0.15), at(0.14, hh + 0.32), at(-0.14, hh + 0.32)], "#c58be8");
      eyes();
      break;
  }
}
