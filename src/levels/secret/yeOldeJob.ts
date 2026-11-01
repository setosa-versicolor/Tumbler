import type { Level, Theme } from "../level";
import type { Prop, PropKind } from "../kit";
import type { Game, GameEvent } from "../../sim/game";
import type { Renderer } from "../../render/renderer";
import { RAPIER } from "../../physics/world";
import { G_BODY, G_PROP, G_WORLD, groups } from "../../physics/groups";
import { clamp } from "../../sim/math";

const W = 14;
/** The weapon rack, on the left: everything lying hilt-out, towards Stanley. */
export const RACK = { x: 0.35 };
/** How hard each weapon hits (Ser Geraldus can take four). */
export const WEAPONS: { kind: PropKind; hh: number; hw: number; y: number; damage: number; density: number }[] = [
  { kind: "sword", hh: 0.45, hw: 0.035, y: 1.05, damage: 1, density: 8 },
  { kind: "axe", hh: 0.4, hw: 0.035, y: 1.45, damage: 2, density: 14 },
  { kind: "spear", hh: 0.65, hw: 0.025, y: 1.85, damage: 1, density: 6 },
];
export const KNIGHT_HP = 4;
/** A swing this fast (m/s, at the business end) lands a hit. */
const HIT_SPEED = 2.2;
/**
 * His shield follows the height of your weapon, but only so fast: swing high
 * then come in low (or vice versa) and you're past it. It's down while he's
 * swinging and getting his breath back, and it only covers his front.
 */
const GUARD_SPEED = 3.6;
const SHIELD = 0.4;
/** He turns round slowly (armour): get behind him and he's open for a moment. */
const TURN_TIME = 0.7;

const MEDIEVAL: Theme = { outdoor: true, top: "#8fc1e6", bottom: "#e9f0e6", floor: "#6b5b45", floorTop: "#857257" };

/** The knight's solid bit, so Stanley can't just walk through him. */
const KNIGHT_GROUPS = groups(G_WORLD, G_BODY | G_PROP);

/** The secret ending, part two: 1194, a courtyard, and a knight with a familiar moustache. */
export const yeOldeJob: Level = {
  id: "ye-olde-job",
  title: "Ye Olde Job",
  goal: "Grab a weapon off the rack. Defeat Ser Geraldus.",
  icon: "⚔️",
  par: [40, 90],
  bounds: { w: W, h: 6 },
  spawn: { x: 2.6, y: 0 },
  target: { x: 9.5, y: 1.2 },
  theme: MEDIEVAL,
  build(kit) {
    kit.enclosure(W, 6, true);
    // The rack: a peg under each weapon (props only: Stanley walks through it).
    const weapons: { prop: Prop; damage: number }[] = WEAPONS.map((w) => {
      kit.solid(RACK.x + w.hh * 0.6, w.y - 0.06, 0.05, 0.03, "ledge", { collides: "props", hidden: true });
      kit.solid(RACK.x + w.hh * 1.6, w.y - 0.06, 0.05, 0.03, "ledge", { collides: "props", hidden: true });
      // Lying sideways, the blade (local +y) towards the wall and the hilt out.
      const prop = kit.box(RACK.x + w.hh, w.y, w.hw, w.hh, { kind: w.kind, density: w.density, friction: 0.8, color: "#c9ccd1", angle: Math.PI / 2 });
      prop.body.userData = { tool: true };
      return { prop, damage: w.damage };
    });

    // Ser Geraldus: a knight (with a moustache that runs in the family).
    const knightBody = kit.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(10, 0.95));
    kit.world.createCollider(RAPIER.ColliderDesc.cuboid(0.26, 0.92).setCollisionGroups(KNIGHT_GROUPS), knightBody);
    type Phase = "halt" | "advance" | "windup" | "strike" | "recover" | "stagger" | "yield";
    const k = { x: 10, hp: KNIGHT_HP, phase: "halt" as Phase, t: 2.2, face: -1, swing: 0, flash: 0, said: false, guard: 1.2, turning: 0, blocks: 0, clang: 0 };
    const guardUp = () => k.phase === "halt" || k.phase === "advance";
    let hitCooldown = 0;
    let punchCooldown = 0;
    let done = 0;

    const tip = (p: Prop) => {
      const q = p.body.translation();
      const a = p.body.rotation();
      return [0.95, 0.55].map((f) => ({ x: q.x - Math.sin(a) * p.hh * f, y: q.y + Math.cos(a) * p.hh * f }));
    };
    const onKnight = (q: { x: number; y: number }) => Math.abs(q.x - k.x) < 0.42 && q.y > 0 && q.y < 2.0;
    const say = (text: string, ev: GameEvent[]) => ev.push({ type: "score", text, pos: { x: k.x, y: 2.5 } });
    const wallop = (g: Game, dir: number) => {
      const st = g.stanley;
      st.balance.knockDown(0.9);
      const c = st.rig.chest;
      c.applyImpulse({ x: dir * 3.4 * c.mass(), y: 1.6 * c.mass() }, true);
    };

    return {
      update(game, dt) {
        const ev: GameEvent[] = [];
        const st = game.stanley;
        const sx = st.rig.pelvis.translation().x;
        k.t -= dt;
        k.flash = Math.max(0, k.flash - dt);
        hitCooldown -= dt;
        punchCooldown -= dt;
        k.clang = Math.max(0, k.clang - dt);
        // Turning round, slowly.
        if (k.phase !== "yield" && k.phase !== "stagger") {
          const want = Math.sign(sx - k.x) || k.face;
          k.turning = want !== k.face ? k.turning + dt : 0;
          if (k.turning > TURN_TIME) {
            k.face = want;
            k.turning = 0;
          }
        }
        // The shield goes where Stanley's weapon is (as fast as he can move it).
        const held = weapons.find((w) => game.held.has(w.prop.body));
        const aim = guardUp() && held ? clamp(tip(held.prop)[0].y, 0.55, 1.8) : guardUp() ? 1.2 : 0.55;
        k.guard += clamp(aim - k.guard, -GUARD_SPEED * dt, GUARD_SPEED * dt);

        // Stanley's swings.
        if (k.phase !== "yield" && hitCooldown <= 0) {
          for (const w of weapons) {
            if (!game.held.has(w.prop.body)) continue;
            const v = w.prop.body.linvel();
            const av = Math.abs(w.prop.body.angvel()) * w.prop.hh;
            const point = tip(w.prop).find(onKnight);
            if (Math.hypot(v.x, v.y) + av < HIT_SPEED || !point) continue;
            const inFront = (point.x - k.x) * k.face > -0.05;
            if (guardUp() && inFront && Math.abs(point.y - k.guard) < SHIELD) {
              // Blocked: a clang off the shield, and the weapon knocked back.
              hitCooldown = 0.35;
              k.clang = 0.2;
              k.blocks++;
              const m = w.prop.body.mass();
              w.prop.body.applyImpulse({ x: k.face * 2 * m, y: 0.6 * m }, true);
              ev.push({ type: "impact", pos: point, strength: 6 }, { type: "score", text: "BLOCKED!", pos: { x: k.x + k.face * 0.4, y: k.guard + 0.5 } });
              // Two in a row and he gets cocky: in he comes, shield down.
              if (k.blocks >= 2 && k.phase === "advance") {
                k.blocks = 0;
                k.phase = "windup";
                k.t = 0.65;
                say(["Predictable!", "Is that all?", "Ha! A peasant's swing!"][Math.floor(game.rand() * 3)], ev);
              }
              break;
            }
            k.blocks = 0;
            k.hp = Math.max(0, k.hp - w.damage);
            k.flash = 0.25;
            hitCooldown = 0.4;
            ev.push({ type: "impact", pos: { x: k.x, y: 1.3 }, strength: 9 }, { type: "score", text: w.damage > 1 ? "CLANG!!" : "CLANG!", pos: { x: k.x, y: 2.1 } });
            if (k.hp <= 0) {
              k.phase = "yield";
              k.t = 2.2;
              ev.push({ type: "sfx", name: "rumble", pos: { x: k.x, y: 1 } });
            } else {
              k.phase = "stagger";
              k.t = 0.5;
              if (k.hp === 2) say("Have at thee!", ev);
            }
            break;
          }
          // Bare hands: no use whatsoever.
          const fist = [st.rig.arms.L.hand, st.rig.arms.R.hand].find((h) => {
            const v = h.linvel();
            return onKnight(h.translation()) && Math.hypot(v.x, v.y) > 2.5 && !weapons.some((w) => game.held.has(w.prop.body));
          });
          if (fist && punchCooldown <= 0) {
            punchCooldown = 1.2;
            ev.push({ type: "score", text: "Ow. (Yours, not his.)", pos: { ...fist.translation(), y: fist.translation().y + 0.5 } });
          }
        }

        // The knight.
        switch (k.phase) {
          case "halt":
            if (!k.said) {
              k.said = true;
              say("Halt! Thy performance shall be reviewed!", ev);
            }
            if (k.t <= 0) k.phase = "advance";
            break;
          case "advance":
            if (Math.abs(sx - k.x) < 1.15 && st.balance.posture === "up") {
              k.phase = "windup";
              k.t = 0.65;
            } else k.x = clamp(k.x + k.face * 0.85 * dt, 3.4, W - 0.6);
            break;
          case "windup":
            // (Drops the shield to swing two-handed: there's the opening.)
            k.swing = Math.min(1, k.swing + dt * 2);
            if (k.t <= 0) {
              k.phase = "strike";
              k.t = 0.15;
            }
            break;
          case "strike":
            k.swing = -1;
            if (Math.abs(sx - k.x) < 1.45 && st.balance.posture === "up") {
              wallop(game, k.face);
              ev.push({ type: "ouch", text: "WHACK!", pos: { x: sx, y: 2.2 } });
              k.t = 0;
            }
            if (k.t <= 0) {
              k.phase = "recover";
              k.t = 1.1;
            }
            break;
          case "recover":
            k.swing = Math.min(0, k.swing + dt * 2);
            if (k.t <= 0) k.phase = "advance";
            break;
          case "stagger":
            k.swing = 0;
            k.x = clamp(k.x - k.face * 1.4 * dt, 3.4, W - 0.6);
            if (k.t <= 0) k.phase = "advance";
            break;
          case "yield":
            k.swing = 0;
            done += dt;
            break;
        }
        knightBody.setNextKinematicTranslation({ x: k.x, y: k.phase === "yield" ? 0.95 - Math.min(0.5, done) : 0.95 });
        return ev;
      },
      progress: () => ({
        done: k.phase === "yield" && done > 1.2,
        label: k.phase === "yield" ? "Victory! Of a sort." : `Ser Geraldus ${"♥".repeat(k.hp)}${"♡".repeat(KNIGHT_HP - k.hp)}`,
      }),
      drawBack(r, game) {
        drawCastle(r, game);
        // The rack, against the wall.
        r.rect(0.1, 0, RACK.x, 2.3, "#6b4a3a");
        for (const w of WEAPONS) {
          r.rect(RACK.x + w.hh * 0.6 - 0.05, w.y - 0.09, RACK.x + w.hh * 0.6 + 0.05, w.y - 0.03, "#8a6a4e");
          r.rect(RACK.x + w.hh * 1.6 - 0.05, w.y - 0.09, RACK.x + w.hh * 1.6 + 0.05, w.y - 0.03, "#8a6a4e");
        }
      },
      drawMid(r) {
        drawKnight(r, k, done, guardUp());
      },
    };
  },
};

function drawCastle(r: Renderer, game: Game) {
  // Hills, a castle wall with battlements and a tower, banners, a goat.
  r.poly([{ x: 0, y: 0 }, { x: 4, y: 1.6 }, { x: 9, y: 0.6 }, { x: 14, y: 1.9 }, { x: 14, y: 0 }], "#9cc48a");
  r.rect(3.2, 0, 14, 3.0, "#a59a8a");
  for (let x = 3.2; x < 14; x += 0.6) r.rect(x, 3.0, x + 0.35, 3.35, "#a59a8a");
  for (let row = 0; row < 6; row++) for (let x = 3.2 + (row % 2) * 0.3; x < 14; x += 0.6) r.rect(x + 0.02, row * 0.5 + 0.02, x + 0.56, row * 0.5 + 0.46, "rgba(255,255,255,0.06)");
  r.rect(11.8, 0, 13.6, 4.6, "#968b7b");
  for (let x = 11.8; x < 13.6; x += 0.45) r.rect(x, 4.6, x + 0.25, 4.95, "#968b7b");
  r.roundRect(12.45, 0, 12.95, 1.4, 0.25, "#4a3a2a");
  r.rect(12.6, 3.2, 12.8, 3.8, "#2a2230");
  // Banners: Odd Jobs Ltd., est. considerably earlier than you'd think.
  for (const x of [5.2, 8.4]) {
    const flap = Math.sin(game.time * 2 + x) * 0.05;
    r.poly([{ x, y: 2.8 }, { x: x + 0.7, y: 2.8 }, { x: x + 0.7 + flap, y: 1.6 }, { x: x + 0.35, y: 1.85 }, { x: x + flap, y: 1.6 }], "#3b6ea8");
    r.text("OJ", { x: x + 0.35, y: 2.35 }, 0.22, "#f2c94c");
  }
  // A goat, unimpressed.
  const gx = 4.3;
  r.roundRect(gx - 0.3, 0.3, gx + 0.25, 0.65, 0.12, "#e8e2d4");
  r.circle({ x: gx + 0.32, y: 0.72 }, 0.13, "#e8e2d4");
  for (const dx of [-0.2, -0.05, 0.08, 0.2]) r.rect(gx + dx - 0.03, 0, gx + dx + 0.03, 0.32, "#6b5b45");
  r.circle({ x: gx + 0.36, y: 0.75 }, 0.02, "#2a2230");
}

function drawKnight(
  r: Renderer,
  k: { x: number; face: number; swing: number; flash: number; phase: string; hp: number; guard: number; clang: number },
  down: number,
  guarding: boolean,
) {
  const x = k.x;
  const f = k.face;
  // Kneeling, once he's yielded.
  const y = k.phase === "yield" ? -Math.min(0.5, down) : 0;
  const steel = k.flash > 0 ? "#ffffff" : "#9aa3ad";
  // Legs, body, red tabard, a plume.
  r.rect(x - 0.2, y, x - 0.05, y + 0.85, "#7a828c");
  r.rect(x + 0.05, y, x + 0.2, y + 0.85, "#7a828c");
  r.roundRect(x - 0.28, y + 0.8, x + 0.28, y + 1.55, 0.1, steel);
  r.rect(x - 0.2, y + 0.8, x + 0.2, y + 1.45, "#c0392b");
  r.text("OJ", { x, y: y + 1.12 }, 0.14, "#f2c94c");
  r.roundRect(x - 0.2, y + 1.55, x + 0.2, y + 2.0, 0.12, steel);
  r.rect(x + f * 0.02 - 0.16, y + 1.74, x + f * 0.02 + 0.16, y + 1.79, "#2a2230");
  // The moustache. It runs in the family.
  r.roundRect(x + f * 0.03 - 0.27, y + 1.6, x + f * 0.03 + 0.27, y + 1.7, 0.05, "#5f5a55");
  r.roundRect(x + f * 0.03 - 0.3, y + 1.56, x + f * 0.03 - 0.2, y + 1.66, 0.04, "#5f5a55");
  r.roundRect(x + f * 0.03 + 0.2, y + 1.56, x + f * 0.03 + 0.3, y + 1.66, 0.04, "#5f5a55");
  r.poly([{ x: x - 0.04, y: y + 2.0 }, { x: x - f * 0.3, y: y + 2.3 }, { x: x + 0.06, y: y + 2.0 }], "#e85d5d");
  // The sword: raised for the windup, swung down on the strike.
  const angle = k.phase === "yield" ? -1.4 : 0.5 + k.swing * 1.1;
  const hand = { x: x + f * 0.3, y: y + 1.2 };
  const end = { x: hand.x + f * Math.cos(angle) * 0.85, y: hand.y + Math.sin(angle) * 0.85 };
  r.line(hand, end, 0.05, "#d6dbe0");
  r.line({ x: hand.x - f * 0.05, y: hand.y - 0.1 }, { x: hand.x + f * 0.05, y: hand.y + 0.1 }, 0.04, "#8a6a4e");
  r.circle(hand, 0.07, "#7a828c");
  // The shield: up where your weapon is, or down at his side while he swings.
  const sx = x + f * (guarding ? 0.36 : 0.2);
  const sy = guarding ? k.guard + y : y + 0.62;
  const hw = guarding ? 0.17 : 0.12;
  const face = k.clang > 0 ? "#ffffff" : "#3b6ea8";
  r.poly(
    [
      { x: sx - hw, y: sy + 0.36 },
      { x: sx + hw, y: sy + 0.36 },
      { x: sx + hw, y: sy - 0.1 },
      { x: sx, y: sy - 0.4 },
      { x: sx - hw, y: sy - 0.1 },
    ],
    face,
  );
  r.poly(
    [
      { x: sx - hw + 0.04, y: sy + 0.32 },
      { x: sx + hw - 0.04, y: sy + 0.32 },
      { x: sx + hw - 0.04, y: sy - 0.08 },
      { x: sx, y: sy - 0.34 },
      { x: sx - hw + 0.04, y: sy - 0.08 },
    ],
    k.clang > 0 ? "#ffffff" : "#4f84c4",
  );
  r.text("OJ", { x: sx, y: sy + 0.05 }, 0.11, "#f2c94c");
}
