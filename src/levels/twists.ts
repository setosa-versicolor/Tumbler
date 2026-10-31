import type { Collider, RigidBody } from "@dimforge/rapier2d-deterministic-compat";
import { RAPIER } from "../physics/world";
import { G_BODY, G_FLOOR, G_PROP, G_WORLD, groups } from "../physics/groups";
import type { Game, GameEvent } from "../sim/game";
import type { Renderer } from "../render/renderer";
import { clamp, type Vec } from "../sim/math";

// Overtime twists: complications layered over a level after the story's
// done. Each is self-contained: it starts with the level, ticks every
// physics step, and draws its own bits.

export interface TwistInstance {
  update(game: Game, dt: number): GameEvent[];
  draw?(r: Renderer, game: Game): void;
}

export interface Twist {
  id: string;
  name: string;
  /** One line for the intro card. */
  blurb: string;
  start(game: Game): TwistInstance;
}

/** Collides with level geometry and Stanley, but never the job's props. */
const MISSILE_GROUPS = groups(G_PROP, G_WORLD | G_FLOOR | G_BODY);
/**
 * Just fired: clears whatever's next to the cannon (a crate, a bin, a
 * backboard) and only starts hitting scenery once it's out in the open.
 */
const LAUNCH_GROUPS = groups(G_PROP, G_BODY);
const GROUND_QUERY = groups(0xffff, G_WORLD | G_FLOOR);

/** Height of the walkable surface under x (searching down from `from`). */
function groundAt(game: Game, x: number, from = 20): number {
  const hit = game.world.castRay(new RAPIER.Ray({ x, y: from }, { x: 0, y: -1 }), from + 5, true, undefined, GROUND_QUERY);
  return hit ? from - hit.timeOfImpact : 0;
}

/** Knock Stanley flying: down he goes, with a shove. */
function wallop(game: Game, push: Vec, squash = 0) {
  const st = game.stanley;
  st.balance.knockDown(0.9);
  st.squash = Math.max(st.squash, squash);
  const c = st.rig.chest;
  c.applyImpulse({ x: push.x * c.mass(), y: push.y * c.mass() }, true);
}

// ------------------------------------------------------------- cannons ---

function cannons(): Twist {
  return {
    id: "cannons",
    name: "Cannon Fire",
    blurb: "Someone has set up cannons. Nobody will say who.",
    start(game) {
      const PERIOD = 3.4;
      const FLIGHT = 1.05;
      const R = 0.15;
      const w = game.level.bounds.w;
      // A cannon on each side with open ground (not up on a roof or a dock wall).
      // Placed on the first update: the physics answers ground queries only
      // once it's taken a step (before that, every cannon sat at height 0).
      let sides: { x: number; y: number; dir: number }[] = [];
      const place = (g: Game) => {
        // Search down from a couple of metres over the floor: from higher up, indoors, it'd find the ceiling.
        const from = g.level.spawn.y + 2.5;
        const all = [0.35, w - 0.35].map((x, i) => ({ x, y: groundAt(g, x, from), dir: i ? -1 : 1 }));
        const usable = all.filter((s) => s.y < g.level.spawn.y + 0.8);
        sides = usable.length ? usable : [all[0]];
      };
      let timer = 1.8;
      let flash = 0;
      let lastSide = 0;
      const balls: { body: RigidBody; col: Collider; age: number; hit: boolean; clear: boolean }[] = [];
      return {
        update(g, dt) {
          const ev: GameEvent[] = [];
          if (!sides.length) place(g);
          timer -= dt;
          flash = Math.max(0, flash - dt);
          if (timer <= 0) {
            timer = PERIOD;
            // Fire from whichever side is further from Stanley: more warning.
            const sx = g.stanley.position.x;
            lastSide = sides.length > 1 && Math.abs(sides[1].x - sx) > Math.abs(sides[0].x - sx) ? 1 : 0;
            const s = sides[lastSide];
            const muzzle = { x: s.x + s.dir * 0.3, y: s.y + 0.55 };
            const v = g.stanley.rig.chest.linvel();
            // Longer shots go higher, lobbing over whatever's in between.
            const flight = clamp(0.5 + Math.abs(g.stanley.position.x - muzzle.x) * 0.12, FLIGHT, 1.8);
            const aim = { x: g.stanley.position.x + v.x * flight * 0.6, y: g.stanley.position.y };
            const vx = (aim.x - muzzle.x) / flight;
            const vy = (aim.y - muzzle.y) / flight + 0.5 * g.tuning.gravity * flight;
            const body = g.world.createRigidBody(
              RAPIER.RigidBodyDesc.dynamic().setTranslation(muzzle.x, muzzle.y).setLinvel(vx, vy).setCcdEnabled(true),
            );
            const col = g.world.createCollider(RAPIER.ColliderDesc.ball(R).setDensity(60).setRestitution(0.3).setCollisionGroups(LAUNCH_GROUPS), body);
            balls.push({ body, col, age: 0, hit: false, clear: false });
            flash = 0.25;
            ev.push({ type: "sfx", name: "boom", pos: muzzle });
          }
          const rig = g.stanley.rig;
          for (const b of [...balls]) {
            b.age += dt;
            const p = b.body.translation();
            // Out in the open (a little way out, and not inside anything): now it hits scenery.
            if (!b.clear && b.age > 0.15) {
              let inside = false;
              g.world.intersectionsWithShape(p, 0, new RAPIER.Ball(R + 0.05), () => ((inside = true), false), undefined, GROUND_QUERY);
              if (!inside) {
                b.clear = true;
                b.col.setCollisionGroups(MISSILE_GROUPS);
              }
            }
            const v = b.body.linvel();
            if (!b.hit && Math.hypot(v.x, v.y) > 2.5) {
              const struck = [rig.chest, rig.head, rig.pelvis].some((part) => {
                const q = part.translation();
                return Math.hypot(q.x - p.x, q.y - p.y) < R + 0.27;
              });
              if (struck) {
                b.hit = true;
                wallop(g, { x: Math.sign(v.x) * 2.5, y: -1 }, 1);
                ev.push({ type: "ouch", text: "SPLAT!", pos: { x: p.x, y: p.y + 0.6 } });
              }
            }
            if (b.age > 4.5 || p.y < -3 || p.x < -2 || p.x > w + 2) {
              g.world.removeRigidBody(b.body);
              balls.splice(balls.indexOf(b), 1);
            }
          }
          return ev;
        },
        draw(r) {
          sides.forEach((s, i) => {
            const dir = s.dir;
            r.circle({ x: s.x, y: s.y + 0.18 }, 0.18, "#5b4330");
            r.circle({ x: s.x, y: s.y + 0.18 }, 0.07, "#2a2230");
            r.line({ x: s.x - dir * 0.15, y: s.y + 0.35 }, { x: s.x + dir * 0.4, y: s.y + 0.6 }, 0.2, "#2a2230");
            if (flash > 0 && i === lastSide) r.circle({ x: s.x + dir * 0.5, y: s.y + 0.65 }, 0.25 * (flash / 0.25) + 0.1, "rgba(255,200,80,0.8)");
          });
          for (const b of balls) r.circle(b.body.translation(), R, "#2a2230");
        },
      };
    },
  };
}

// -------------------------------------------------------------- goblin ---

function goblin(): Twist {
  return {
    id: "goblin",
    name: "Goblin",
    blurb: "There's a goblin under the floor. It has a spear and a grudge.",
    start() {
      type Phase = "waiting" | "rumble" | "up" | "stab" | "down";
      let phase: Phase = "waiting";
      let t = 2.5;
      let at = { x: 0, y: 0 };
      let dir = 1;
      let rise = 0;
      let thrust = 0;
      return {
        update(g, dt) {
          const ev: GameEvent[] = [];
          t -= dt;
          const st = g.stanley;
          if (phase === "waiting" && t <= 0) {
            // Pop up a little way ahead of wherever Stanley's heading
            // (allowing for how far he'll get while the ground rumbles).
            const p = st.rig.pelvis.translation();
            const vx = st.rig.pelvis.linvel().x;
            dir = st.facing;
            const x = clamp(p.x + vx * 1.15 + dir * 0.9, 0.6, g.level.bounds.w - 0.6);
            at = { x, y: groundAt(g, x, p.y + 1) };
            phase = "rumble";
            t = 0.9;
            ev.push({ type: "sfx", name: "rumble", pos: at });
          } else if (phase === "rumble" && t <= 0) {
            phase = "up";
            t = 0.25;
          } else if (phase === "up") {
            rise = Math.min(1, rise + dt * 4);
            if (t <= 0) {
              phase = "stab";
              t = 0.45;
            }
          } else if (phase === "stab") {
            thrust = Math.min(1, thrust + dt * 6);
            const p = st.rig.pelvis.translation();
            // It jabs at Stanley, whichever side he's on.
            if (thrust < 0.1) dir = -(Math.sign(p.x - at.x) || 1);
            const reach = Math.abs(p.x - at.x) < 1.15 && Math.abs(p.y - st.balance.groundDist - at.y) < 0.5;
            if (thrust > 0.6 && reach && st.balance.posture === "up") {
              wallop(g, { x: -dir * 3.2, y: 1.5 });
              ev.push({ type: "ouch", text: "OW!", pos: { x: p.x, y: p.y + 1.1 } });
              thrust = 1;
              t = 0;
            }
            if (t <= 0) {
              phase = "down";
              t = 0.5;
            }
          } else if (phase === "down") {
            rise = Math.max(0, rise - dt * 2.5);
            thrust = Math.max(0, thrust - dt * 4);
            if (t <= 0) {
              phase = "waiting";
              t = 3.5 + g.rand() * 2.5;
            }
          }
          return ev;
        },
        draw(r, g) {
          if (phase === "waiting") return;
          // Dirt mound, shaking while it rumbles.
          const shake = phase === "rumble" ? Math.sin(g.time * 60) * 0.03 : 0;
          r.poly(
            [
              { x: at.x - 0.35 + shake, y: at.y },
              { x: at.x + shake, y: at.y + 0.14 },
              { x: at.x + 0.35 + shake, y: at.y },
            ],
            "#6b5340",
          );
          if (rise <= 0) return;
          // The goblin: green, pointy, pleased with itself.
          const y = at.y - 0.6 + rise * 0.6;
          // Facing back toward Stanley (the spear points at him).
          const f = -dir;
          r.roundRect(at.x - 0.17, y, at.x + 0.17, y + 0.45, 0.08, "#4f7a3a");
          r.circle({ x: at.x, y: y + 0.58 }, 0.17, "#7bbf5a");
          r.poly([{ x: at.x - 0.14, y: y + 0.65 }, { x: at.x - 0.36, y: y + 0.78 }, { x: at.x - 0.12, y: y + 0.55 }], "#7bbf5a");
          r.poly([{ x: at.x + 0.14, y: y + 0.65 }, { x: at.x + 0.36, y: y + 0.78 }, { x: at.x + 0.12, y: y + 0.55 }], "#7bbf5a");
          r.circle({ x: at.x + f * 0.07, y: y + 0.62 }, 0.035, "#e85d5d");
          r.line({ x: at.x + f * 0.02, y: y + 0.5 }, { x: at.x + f * 0.13, y: y + 0.52 }, 0.02, "#2a2230");
          const tip = at.x + f * (0.35 + thrust * 0.75);
          r.line({ x: at.x - f * 0.25, y: y + 0.3 }, { x: tip, y: y + 0.3 }, 0.035, "#8a6a4e");
          r.poly([{ x: tip, y: y + 0.38 }, { x: tip + f * 0.18, y: y + 0.3 }, { x: tip, y: y + 0.22 }], "#c9ccd1");
        },
      };
    },
  };
}

// -------------------------------------------------------------- rabbit ---

function rabbit(): Twist {
  return {
    id: "rabbit",
    name: "Rabbit",
    blurb: "There's a rabbit. Don't startle the rabbit. You'll regret startling the rabbit.",
    start(game) {
      const w = game.level.bounds.w;
      const rb = { x: clamp(game.level.spawn.x + 3, 1, w - 1), y: 0, vx: 0, hop: 0, startled: 0, look: 1 };
      // (Ground queries only work once the physics has stepped, so start on
      // the spawn floor; the first update finds the ground properly.)
      rb.y = game.level.spawn.y;
      let target = rb.x;
      let wander = 1;
      let poopCooldown = 0;
      let slipCooldown = 0;
      const poops: Vec[] = [];
      return {
        update(g, dt) {
          const ev: GameEvent[] = [];
          const st = g.stanley;
          const p = st.rig.pelvis.translation();
          const speed = Math.abs(st.rig.pelvis.linvel().x);
          const near = Math.abs(p.x - rb.x) < 1.6 && Math.abs(p.y - st.balance.groundDist - rb.y) < 0.8;
          poopCooldown -= dt;
          slipCooldown -= dt;
          rb.startled = Math.max(0, rb.startled - dt);

          // Startle: something big moving fast nearby.
          if (near && speed > 2.0 && poopCooldown <= 0) {
            poopCooldown = 1.4;
            rb.startled = 0.8;
            poops.push({ x: rb.x, y: rb.y });
            ev.push({ type: "sfx", name: "poop", pos: { x: rb.x, y: rb.y } });
            // …and bolt the other way.
            target = clamp(rb.x + Math.sign(rb.x - p.x || 1) * 2.5, 0.6, w - 0.6);
          }
          // Wander about.
          wander -= dt;
          if (wander <= 0) {
            wander = 1.5 + g.rand() * 2;
            if (!near) target = clamp(rb.x + (g.rand() - 0.5) * 3, 0.6, w - 0.6);
          }
          const dx = target - rb.x;
          rb.vx = Math.abs(dx) > 0.05 ? Math.sign(dx) * (rb.startled > 0 ? 3 : 1.2) : 0;
          if (rb.vx) rb.look = Math.sign(rb.vx);
          rb.x += rb.vx * dt;
          rb.hop = rb.vx ? (rb.hop + dt * (rb.startled > 0 ? 9 : 5)) % 1 : 0;
          rb.y = groundAt(g, rb.x, rb.y + 1.2);

          // Slip: a foot comes down on a dropping while Stanley's moving.
          if (slipCooldown <= 0 && st.balance.posture === "up" && st.balance.grounded && speed > 0.25) {
            for (const leg of Object.values(st.rig.legs)) {
              const s = leg.shin.translation();
              const a = leg.shin.rotation();
              const foot = { x: s.x + Math.sin(a) * 0.2, y: s.y - Math.cos(a) * 0.2 };
              if (poops.some((q) => Math.abs(foot.x - q.x) < 0.15 && Math.abs(foot.y - q.y) < 0.22)) {
                slipCooldown = 1.2;
                const f = Math.sign(st.rig.pelvis.linvel().x) || st.facing;
                st.balance.knockDown(1.0);
                // Feet out from under him, banana-peel style.
                for (const l of Object.values(st.rig.legs)) l.shin.applyImpulse({ x: f * l.shin.mass() * 4, y: l.shin.mass() * 4 }, true);
                st.rig.chest.applyImpulse({ x: -f * st.rig.chest.mass() * 1.5, y: 0 }, true);
                ev.push({ type: "ouch", text: "WHOOPS!", pos: { x: foot.x, y: foot.y + 1.4 } });
                break;
              }
            }
          }
          return ev;
        },
        draw(r) {
          for (const q of poops) for (const [dx, dy] of [[-0.05, 0.03], [0.03, 0.03], [0, 0.07], [0.07, 0.025]] as const) r.circle({ x: q.x + dx, y: q.y + dy }, 0.032, "#5b3a22");
          const hopY = Math.sin(rb.hop * Math.PI) * 0.18;
          const x = rb.x;
          const y = rb.y + hopY;
          const f = rb.look;
          r.roundRect(x - 0.17, y, x + 0.15, y + 0.2, 0.09, "#f4efe6");
          r.circle({ x: x - f * 0.17, y: y + 0.1 }, 0.06, "#ffffff");
          r.circle({ x: x + f * 0.16, y: y + 0.24 }, 0.1, "#f4efe6");
          r.roundRect(x + f * 0.1 - 0.03, y + 0.3, x + f * 0.1 + 0.03, y + 0.55, 0.03, "#f4efe6");
          r.roundRect(x + f * 0.19 - 0.03, y + 0.3, x + f * 0.19 + 0.03, y + 0.52, 0.03, "#f4efe6");
          r.circle({ x: x + f * 0.21, y: y + 0.26 }, 0.018, "#2a2230");
          r.circle({ x: x + f * 0.26, y: y + 0.22 }, 0.015, "#e8a0a0");
          if (rb.startled > 0) r.text("!", { x: x + f * 0.1, y: y + 0.75 }, 0.3, "#c0392b", "center", 900);
        },
      };
    },
  };
}

// --------------------------------------------------- simple environment ---

function lowGravity(): Twist {
  return {
    id: "moon",
    name: "Low Gravity",
    blurb: "The building's gravity is on the fritz. Facilities is 'looking into it.'",
    start(game) {
      game.tuning = { ...game.tuning, gravity: 3.2 };
      return { update: () => [] };
    },
  };
}

function waxedFloor(): Twist {
  return {
    id: "ice",
    name: "Freshly Waxed",
    blurb: "The floor has been freshly waxed. Very freshly. Extremely freshly.",
    start(game) {
      game.tuning = { ...game.tuning, traction: 0.16 };
      game.world.forEachCollider((c) => {
        if (!c.parent()?.isDynamic()) c.setFriction(0.03);
      });
      return {
        update: () => [],
        draw(r, g) {
          // A sheen on the floor, and the obligatory sign, ignored.
          const w = g.level.bounds.w;
          for (let x = 0.4; x < w; x += 1.3) r.line({ x, y: 0.02 }, { x: x + 0.5, y: 0.02 }, 0.02, "rgba(255,255,255,0.7)");
          const sx = g.level.spawn.x + 0.9;
          r.poly([{ x: sx - 0.2, y: 0 }, { x: sx, y: 0.55 }, { x: sx + 0.2, y: 0 }], "#f2c94c");
          r.text("WET", { x: sx, y: 0.2 }, 0.09, "#2a2230", "center", 900);
        },
      };
    },
  };
}

function wind(): Twist {
  return {
    id: "wind",
    name: "Gusty",
    blurb: "It's very windy today. Hold on to things. Hold on to yourself.",
    start() {
      const PERIOD = 6;
      const GUST = 2.2;
      let t = 0;
      let dir = 1;
      return {
        update(g, dt) {
          const ev: GameEvent[] = [];
          const before = t % PERIOD;
          t += dt;
          const phase = t % PERIOD;
          if (phase < before) dir = -dir;
          if (before < PERIOD - GUST && phase >= PERIOD - GUST) ev.push({ type: "sfx", name: "gust", pos: g.stanley.position });
          const k = phase > PERIOD - GUST ? Math.sin(((phase - (PERIOD - GUST)) / GUST) * Math.PI) : 0;
          if (k > 0) {
            for (const b of g.stanley.rig.bodies) b.applyImpulse({ x: dir * 7 * k * b.mass() * dt, y: 0 }, true);
            for (const p of g.props) if (p.body.mass() < 6) p.body.applyImpulse({ x: dir * 6 * k * p.body.mass() * dt, y: 1.5 * k * p.body.mass() * dt }, true);
          }
          return ev;
        },
        draw(r, g) {
          const phase = t % PERIOD;
          const k = phase > PERIOD - GUST ? Math.sin(((phase - (PERIOD - GUST)) / GUST) * Math.PI) : 0;
          if (k <= 0) return;
          const w = g.level.bounds.w;
          for (let i = 0; i < 14; i++) {
            const y = 0.3 + ((i * 0.37) % 1) * 4;
            const x = (((g.time * 6 * dir + i * 1.7) % (w + 4)) + w + 4) % (w + 4) - 2;
            r.line({ x, y }, { x: x + dir * 0.7, y }, 0.02, `rgba(255,255,255,${0.6 * k})`);
          }
        },
      };
    },
  };
}

function earthquake(): Twist {
  return {
    id: "quake",
    name: "Earthquake",
    blurb: "Seismic activity has been reported. Mostly in this room. Mostly right now.",
    start() {
      const PERIOD = 7;
      const QUAKE = 1.6;
      let t = 2;
      let jolt = 0;
      return {
        update(g, dt) {
          const ev: GameEvent[] = [];
          t += dt;
          const phase = t % PERIOD;
          if (phase > PERIOD - QUAKE) {
            jolt -= dt;
            if (jolt <= 0) {
              jolt = 0.16;
              for (const p of g.props) {
                const m = p.body.mass();
                p.body.applyImpulse({ x: (g.rand() - 0.5) * 1.6 * m, y: (1 + g.rand() * 1.5) * m }, true);
              }
              const c = g.stanley.rig.chest;
              c.applyImpulse({ x: (g.rand() - 0.5) * 2.4 * c.mass(), y: 0 }, true);
              ev.push({ type: "impact", pos: g.stanley.position, strength: 8 });
            }
          }
          return ev;
        },
      };
    },
  };
}

/** The finale gets everything at once. */
function everything(): Twist {
  const parts = [cannons(), goblin(), rabbit()];
  return {
    id: "everything",
    name: "All of the Above",
    blurb: "Cannons. A goblin. A rabbit. It's your first day as CEO; this is just how it is now.",
    start(game) {
      const insts = parts.map((p) => p.start(game));
      return {
        update: (g, dt) => insts.flatMap((i) => i.update(g, dt)),
        draw: (r, g) => insts.forEach((i) => i.draw?.(r, g)),
      };
    },
  };
}

export const TWISTS: Record<string, Twist> = Object.fromEntries(
  [cannons(), goblin(), rabbit(), lowGravity(), waxedFloor(), wind(), earthquake(), everything()].map((t) => [t.id, t]),
);

/** Which twist each job gets in Overtime. */
export const LEVEL_TWISTS: Record<string, string> = {
  "ding-dong": "goblin",
  "laundry-day": "rabbit",
  "stack-it": "quake",
  "pizza-up": "cannons",
  "crate-expectations": "wind",
  "fish-toss": "cannons",
  "roll-out": "ice",
  "crows-nest": "wind",
  "moving-day": "goblin",
  "hang-the-painting": "rabbit",
  "pin-reset": "quake",
  "coffee-run": "moon",
  "window-washer": "wind",
  "mail-room": "cannons",
  "shred-it": "rabbit",
  "fire-drill": "ice",
  "executive-action": "everything",
};

export function twistFor(levelId: string): Twist | null {
  const id = LEVEL_TWISTS[levelId];
  return id ? TWISTS[id] : null;
}
