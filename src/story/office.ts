import { INDOOR, type Level, type LevelInstance } from "../levels/level";
import type { Prop } from "../levels/kit";
import type { Game } from "../sim/game";
import type { Renderer } from "../render/renderer";

export const DESK = { x0: 5.8, x1: 8.2, top: 0.85 };
export const BOSS = { x: 7.45, headY: 1.78 };
/** Where Stanley stops in front of the desk. */
export const VISITOR_X = 4.95;
export const DOOR_X = 0.75;

export type Incident = "mug" | "pens" | "nameplate" | "photo" | "files" | "plant" | "cooler" | "floor";

export interface OfficeInstance extends LevelInstance {
  /** Gerald's mouth moves while this is true. */
  talking: boolean;
  /** Incidents that happened since the last call. */
  takeIncidents(game: Game): Incident[];
  /** How many things have been knocked over so far. */
  readonly mishaps: number;
  item(tag: Incident): Prop | undefined;
}

/** Gerald's office. Every review is played out here with live physics. */
export const office: Level = {
  id: "office",
  title: "Odd Jobs Ltd.",
  goal: "",
  icon: "🏢",
  par: [0, 0],
  bounds: { w: 9, h: 4.6 },
  viewHeight: 4.2,
  spawn: { x: DOOR_X, y: 0 },
  theme: { ...INDOOR, top: "#e9e1d3", bottom: "#d8cdb9", floor: "#5f6b78", floorTop: "#76838f", stripe: undefined },
  sandbox: true,
  build(kit): OfficeInstance {
    kit.enclosure(9, 4.6);
    kit.solid((DESK.x0 + DESK.x1) / 2, DESK.top / 2, (DESK.x1 - DESK.x0) / 2, DESK.top / 2, "desk");
    const on = (hh: number) => DESK.top + hh + 0.005;
    kit.box(2.5, 0.5, 0.2, 0.5, { kind: "cooler", density: 30, color: "#f2f4f6", tag: "cooler" });
    kit.box(4.15, 0.2, 0.16, 0.2, { kind: "plant", density: 25, color: "#c4704a", tag: "plant" });
    kit.box(6.0, on(0.075), 0.06, 0.075, { kind: "mug", density: 8, color: "#f4f4f4", tag: "mug" });
    kit.box(6.25, on(0.09), 0.06, 0.09, { kind: "pens", density: 8, color: "#3b4a7a", tag: "pens" });
    kit.box(6.75, on(0.05), 0.22, 0.05, { kind: "nameplate", density: 10, color: "#6b4a3a", tag: "nameplate" });
    kit.box(7.35, on(0.06), 0.25, 0.06, { kind: "files", density: 6, color: "#e8c77a", tag: "files" });
    kit.box(8.0, on(0.12), 0.09, 0.12, { kind: "photo", density: 8, color: "#8a6a4e", tag: "photo" });

    const tagged = new Map(kit.props.filter((p) => p.tag).map((p) => [p.tag as Incident, p]));
    const start = new Map([...tagged].map(([t, p]) => [t, { ...p.body.translation() }]));
    const happened = new Set<Incident>();
    let lastPosture = "up";

    const inst: OfficeInstance = {
      talking: false,
      get mishaps() {
        return happened.size;
      },
      item: (tag) => tagged.get(tag),
      takeIncidents(game) {
        const fresh: Incident[] = [];
        for (const [tag, p] of tagged) {
          if (happened.has(tag)) continue;
          const pos = p.body.translation();
          const s = start.get(tag)!;
          const toppled = Math.abs(p.body.rotation()) > 1.1;
          const fell = pos.y < s.y - 0.25;
          const shoved = Math.abs(pos.x - s.x) > 0.6;
          if (toppled || fell || shoved) {
            happened.add(tag);
            fresh.push(tag);
          }
        }
        const posture = game.stanley.balance.posture;
        if (posture === "down" && lastPosture !== "down" && !happened.has("floor")) {
          happened.add("floor");
          fresh.push("floor");
        }
        lastPosture = posture;
        return fresh;
      },
      progress: () => ({ done: false }),
      drawBack: (r, game) => {
        drawOffice(r);
        // Drawn before the desk so the desk hides his legs.
        drawBoss(r, inst.talking, game.time);
      },
    };
    return inst;
  },
};

function drawOffice(r: Renderer) {
  // Door.
  r.rect(DOOR_X - 0.5, 0, DOOR_X + 0.5, 2.3, "#8a5a3c");
  r.rect(DOOR_X - 0.4, 0, DOOR_X + 0.4, 2.2, "#a06a48");
  r.circle({ x: DOOR_X + 0.28, y: 1.05 }, 0.05, "#f2c94c");
  // Window with a city view.
  r.rect(5.6, 1.6, 8.6, 3.9, "#8fb8d6");
  for (const [x, h] of [[5.9, 1.2], [6.5, 1.8], [7.1, 0.9], [7.6, 1.5], [8.2, 1.1]] as const)
    r.rect(x - 0.22, 1.6, x + 0.22, 1.6 + h, "#6f93b3");
  r.rect(5.6, 1.6, 8.6, 1.66, "#f2ede4");
  r.rect(5.6, 3.84, 8.6, 3.9, "#f2ede4");
  r.rect(7.07, 1.6, 7.13, 3.9, "#f2ede4");
  // Employee of the Month: twelve months, one employee.
  r.rect(2.7, 2.35, 4.5, 3.55, "#c9a36a");
  r.text("EMPLOYEE OF THE MONTH", { x: 3.6, y: 3.42 }, 0.085, "#5b3a2a");
  for (let i = 0; i < 12; i++) {
    const x = 2.88 + (i % 6) * 0.29;
    const y = 2.55 + Math.floor(i / 6) * 0.4;
    r.rect(x - 0.11, y - 0.14, x + 0.11, y + 0.14, "#f4efe6");
    r.circle({ x, y: y - 0.01 }, 0.07, "#f2c79b");
    r.rect(x - 0.08, y + 0.03, x + 0.08, y + 0.07, "#f08a3c");
  }
  // Motivational poster.
  r.rect(1.5, 2.5, 2.3, 3.5, "#2a3a5a");
  r.text("SYNERGY", { x: 1.9, y: 2.75 }, 0.11, "#f2c94c");
  r.circle({ x: 1.9, y: 3.15 }, 0.18, "#e8a35c");
  // Clock.
  r.circle({ x: 5.0, y: 3.4 }, 0.22, "#f4efe6");
  r.line({ x: 5.0, y: 3.4 }, { x: 5.0, y: 3.55 }, 0.025, "#2a2230");
  r.line({ x: 5.0, y: 3.4 }, { x: 5.1, y: 3.4 }, 0.025, "#2a2230");
  // Big executive chair behind the desk.
  r.roundRect(BOSS.x - 0.42, 0.6, BOSS.x + 0.42, 2.25, 0.18, "#3a2a2a");
}

/** Gerald: seated, unflappable, permanently holding a coffee. */
function drawBoss(r: Renderer, talking: boolean, t: number) {
  const { x, headY } = BOSS;
  // Suit.
  r.roundRect(x - 0.32, 0.85, x + 0.32, 1.6, 0.14, "#4a5160");
  r.poly([{ x: x - 0.1, y: 1.6 }, { x: x + 0.1, y: 1.6 }, { x, y: 1.3 }], "#f4f4f4");
  r.poly([{ x: x - 0.04, y: 1.55 }, { x: x + 0.04, y: 1.55 }, { x: x + 0.05, y: 1.2 }, { x, y: 1.12 }, { x: x - 0.05, y: 1.2 }], "#c0392b");
  // Head, hair, glasses, moustache. He faces Stanley (left).
  r.circle({ x, y: headY }, 0.22, "#eebd92");
  r.poly([{ x: x - 0.2, y: headY + 0.1 }, { x: x + 0.22, y: headY + 0.12 }, { x: x + 0.2, y: headY + 0.2 }, { x: x - 0.12, y: headY + 0.22 }], "#9aa0a8");
  r.ring({ x: x - 0.12, y: headY + 0.02 }, 0.06, "#2a2230", 0.015);
  r.ring({ x: x + 0.03, y: headY + 0.02 }, 0.06, "#2a2230", 0.015);
  r.roundRect(x - 0.17, headY - 0.1, x + 0.02, headY - 0.06, 0.02, "#7a7f86");
  const open = talking ? 0.02 + 0.03 * Math.abs(Math.sin(t * 14)) : 0.008;
  r.roundRect(x - 0.12, headY - 0.15 - open, x - 0.02, headY - 0.13, 0.01, "#6b2a2a");
  // Arm and coffee, raised for a sip every few seconds.
  const sip = Math.max(0, Math.sin(t * 0.9) - 0.85) / 0.15;
  const cup = { x: x - 0.32, y: 1.0 + sip * 0.55 };
  r.line({ x: x - 0.2, y: 1.45 }, cup, 0.11, "#4a5160");
  r.roundRect(cup.x - 0.07, cup.y - 0.02, cup.x + 0.05, cup.y + 0.14, 0.02, "#f4f4f4");
  r.text("#1", { x: cup.x - 0.01, y: cup.y + 0.04 }, 0.06, "#c0392b");
}
