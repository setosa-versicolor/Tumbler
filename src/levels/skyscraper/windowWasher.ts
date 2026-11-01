import { HIGH_RISE, type Level } from "../level";
import type { Prop } from "../kit";
import { Curio } from "../curio";
import type { GameEvent } from "../../sim/game";
import type { Vec } from "../../sim/math";
import { RAPIER } from "../../physics/world";
import { PROP_GROUPS, WORLD_GROUPS } from "../../physics/groups";

/** The cradle: a deck that rides up and down the glass, a rail at the left, the control post at the right. */
export const CRADLE = { x0: 0.6, x1: 5.4, hh: 0.08 };
/** Where the cradle stops: one for each floor of glass. */
export const STOPS = [0.35, 2.75, 5.15];
const SPEED = 0.7;
/** The ▲ and ▼ buttons on the control post, as heights above the deck. */
export const PADS = { x0: CRADLE.x1 - 0.42, x1: CRADLE.x1 - 0.04, up: 1.35, down: 0.95, hh: 0.14 };
/** The glass, behind everything. */
const GLASS = { x0: 0.25, x1: 7.75, y0: 0.55, y1: 8.0 };
/** A pane of glass, by floor (0-2) and column (0-4). */
const pane = (floor: number, col: number) => {
  const y0 = deckTop(STOPS[floor]) + 0.25;
  const x0 = GLASS.x0 + col * 1.5;
  return { x0: x0 + 0.06, y0, x1: x0 + 1.44, y1: y0 + 2.2 };
};
/** The cracked pane, on 49, next to a dirty one. It's clean. Wipe it and it goes. */
export const CRACKED = pane(1, 3);
/** The squeegee's handle half-length; the blade's across the top end. */
const HANDLE = 0.26;
const BLADE = 0.16;

/** The brown spots, as offsets above each stop's deck. */
export const SPOTS: { x: number; floor: number; up: number }[] = [
  { x: 3.4, floor: 0, up: 1.85 },
  { x: 4.4, floor: 0, up: 1.2 },
  { x: 1.3, floor: 1, up: 1.0 },
  { x: 3.0, floor: 1, up: 1.85 },
  { x: 4.5, floor: 1, up: 1.2 },
  { x: 2.2, floor: 2, up: 1.55 },
  { x: 4.1, floor: 2, up: 1.0 },
];
function deckTop(y: number) {
  return y + CRADLE.hh;
}

/** Rubbing this fast (m/s, relative to the cradle) counts as a wipe. */
const WIPE_SPEED = 0.35;
/** Seconds of wet wiping to take a spot right off. */
const WIPE_TIME = 0.5;
/** One dip lasts this many seconds of wiping. */
const WET_SECONDS = 7;
/** Seconds of scrubbing the cracked pane takes before it goes. */
const CRACK_TIME = 0.7;
/** A dry blade drags dirt along, leaving a smear every so often. */
const SMEAR_EVERY = 0.12;

interface Blob {
  x: number;
  y: number;
  r: number;
  dirt: number;
  /** One of the original spots (worth a "Squeaky!"), or a smear Stanley made. */
  spot: boolean;
  /** For drawing an irregular splodge. */
  seed: number;
}

/** Skyscraper job 1: dip the squeegee, wipe the brown spots off the glass, ride the cradle up. */
export const windowWasher: Level = {
  id: "window-washer",
  title: "Window Washer",
  goal: "Dip the squeegee in the suds, then wipe every brown spot off the glass. A dry squeegee just smears it. Smack ▲▼ to move the cradle.",
  icon: "🪟",
  par: [60, 120],
  bounds: { w: 8, h: 8.6 },
  spawn: { x: 2.9, y: deckTop(STOPS[0]) },
  target: { x: SPOTS[0].x, y: STOPS[0] + SPOTS[0].up },
  theme: HIGH_RISE,
  build(kit) {
    kit.enclosure(8, 8.6, true);
    const cradle = kit.platform((CRADLE.x0 + CRADLE.x1) / 2, STOPS[0], (CRADLE.x1 - CRADLE.x0) / 2, CRADLE.hh, 0.9);
    // The control post doubles as the right-hand rail.
    kit.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.05, 0.85).setTranslation((CRADLE.x1 - CRADLE.x0) / 2 - 0.05, CRADLE.hh + 0.85).setCollisionGroups(WORLD_GROUPS),
      cradle,
    );
    const deck0 = deckTop(STOPS[0]);
    const bucket = kit.box(1.15, deck0 + 0.2, 0.24, 0.2, { kind: "bucket", density: 40, friction: 0.9, color: "#5d9de8" });
    // The squeegee: a handle, with a rubber blade across the top end.
    const squeegee: Prop = kit.box(2.3, deck0 + BLADE + 0.01, 0.03, HANDLE, { kind: "squeegee", density: 6, color: "#3a3f48", angle: Math.PI / 2 });
    // Held by the handle's end, blade out, like a longer arm.
    squeegee.body.userData = { tool: true };
    kit.world.createCollider(RAPIER.ColliderDesc.cuboid(BLADE, 0.025).setTranslation(0, HANDLE).setDensity(6).setFriction(0.8).setCollisionGroups(PROP_GROUPS), squeegee.body);

    const blobs: Blob[] = SPOTS.map((s, i) => ({ x: s.x, y: deckTop(STOPS[s.floor]) + s.up, r: 0.22, dirt: 1, spot: true, seed: i * 1.7 }));
    const area = (b: Blob) => b.dirt * b.r * b.r;
    const total0 = blobs.reduce((n, b) => n + area(b), 0);
    /** Soap left on the glass, running slowly down it. Even a perfect job leaves some. */
    const suds: { x: number; y: number; age: number }[] = [];
    /** Drips off a wet blade. */
    const drips: { x: number; y: number; vy: number }[] = [];
    const gerald = new Curio("gerald-window", "Through the glass, Gerald raises his coffee to you.", { x0: pane(2, 4).x0 + 0.3, y0: pane(2, 4).y0 + 0.6, x1: pane(2, 4).x0 + 1.15, y1: pane(2, 4).y0 + 1.6 }, 0.5);

    let y = STOPS[0];
    let stop = 0;
    let target = 0;
    let wet = 0;
    /** Dirt on a dry blade, waiting to be smeared somewhere new. */
    let carry = 0;
    let lastBlade: Vec | null = null;
    let travelled = 0;
    let dripT = 0;
    let padCooldown = 0;
    const handWasIn = { L: "", R: "" } as Record<"L" | "R", string>;
    let taught = false;
    let shattered = false;
    /** How near the cracked pane is to going (0 to 1). */
    let stress = 0;
    /** Bits of glass falling, and papers blowing out of the office behind. */
    const shards: { x: number; y: number; vx: number; vy: number; a: number; paper: boolean }[] = [];

    const blade = (): Vec => {
      const p = squeegee.body.translation();
      const a = squeegee.body.rotation();
      return { x: p.x - Math.sin(a) * HANDLE, y: p.y + Math.cos(a) * HANDLE };
    };
    // Any part of the blade in the suds will do.
    const inBucket = (b: Vec) => {
      const p = bucket.body.translation();
      const a = -bucket.body.rotation();
      const sa = squeegee.body.rotation();
      return [-1, 0, 1].some((k) => {
        const dx = b.x + Math.cos(sa) * BLADE * k - p.x;
        const dy = b.y + Math.sin(sa) * BLADE * k - p.y;
        const lx = dx * Math.cos(a) - dy * Math.sin(a);
        const ly = dx * Math.sin(a) + dy * Math.cos(a);
        return Math.abs(lx) < bucket.hw && ly > bucket.hh - 0.06 && ly < bucket.hh + 0.25;
      });
    };
    const onGlass = (b: Vec) => b.x > GLASS.x0 && b.x < GLASS.x1 && b.y > GLASS.y0 && b.y < GLASS.y1;
    const grime = () => blobs.reduce((n, b) => n + area(b), 0) / total0;
    const state = () => (wet > 0 ? "wet" : carry > 0.05 ? "dirty" : "dry");

    return {
      update(game, dt) {
        const ev: GameEvent[] = [];
        const deck = deckTop(y);

        // The control post: smack ▲ or ▼ to ride up or down a floor.
        padCooldown -= dt;
        for (const side of ["L", "R"] as const) {
          const h = game.stanley.rig.arms[side].hand;
          const p = h.translation();
          const inX = p.x > PADS.x0 && p.x < PADS.x1;
          const pad = !inX ? "" : Math.abs(p.y - (deck + PADS.up)) < PADS.hh ? "up" : Math.abs(p.y - (deck + PADS.down)) < PADS.hh ? "down" : "";
          if (pad && pad !== handWasIn[side] && padCooldown <= 0 && stop === target) {
            const next = target + (pad === "up" ? 1 : -1);
            padCooldown = 0.6;
            if (next >= 0 && next < STOPS.length) {
              target = next;
              ev.push({ type: "press" });
            } else ev.push({ type: "score", text: next < 0 ? "Bottom floor." : "Top floor.", pos: { x: p.x - 0.4, y: p.y + 0.3 } });
          }
          handWasIn[side] = pad;
        }
        // Fell off? The cradle comes back down for him.
        if (game.stanley.rig.pelvis.translation().y < deck - 1.2 && stop === target && stop > 0) target = 0;
        let vy = 0;
        const pel = game.stanley.rig.pelvis.translation();
        // ...but not down on top of him.
        const underneath = pel.x > CRADLE.x0 - 0.3 && pel.x < CRADLE.x1 + 0.3 && pel.y < y && y - pel.y < 1.6;
        if (target !== stop && !(underneath && STOPS[target] < y)) {
          const goal = STOPS[target];
          vy = Math.sign(goal - y) * SPEED;
          y += vy * dt;
          if ((vy > 0 && y >= goal) || (vy < 0 && y <= goal)) {
            y = goal;
            stop = target;
            vy = 0;
          }
        }
        cradle.setNextKinematicTranslation({ x: (CRADLE.x0 + CRADLE.x1) / 2, y });

        // The squeegee.
        const b = blade();
        if (inBucket(b)) {
          if (wet < 0.95) ev.push({ type: "splash", pos: b, big: false });
          wet = 1;
          carry = 0;
        }
        const moved = lastBlade ? Math.hypot(b.x - lastBlade.x, b.y - lastBlade.y - vy * dt) : 0;
        lastBlade = b;
        // The cracked pane: scrub at it and the cracks spread (with a creak by
        // way of warning) until it goes. A brush in passing, or a hand on the
        // ▲▼ buttons in front of it, won't do it.
        const inCrack = (p: Vec) => p.x > CRACKED.x0 && p.x < CRACKED.x1 && p.y > CRACKED.y0 && p.y < CRACKED.y1;
        if (!shattered) {
          if (moved / dt > WIPE_SPEED && inCrack(b) && game.held.has(squeegee.body)) {
            const before = stress;
            stress += dt / CRACK_TIME;
            if (before < 0.4 && stress >= 0.4) ev.push({ type: "score", text: "*creak*", pos: { x: (CRACKED.x0 + CRACKED.x1) / 2, y: CRACKED.y1 - 0.4 } });
          }
          if (stress >= 1) {
            shattered = true;
            game.breaks++;
            const c = { x: (CRACKED.x0 + CRACKED.x1) / 2, y: (CRACKED.y0 + CRACKED.y1) / 2 };
            ev.push({ type: "break", pos: c, kind: "window" }, { type: "score", text: "It was already cracked. Was.", pos: { x: c.x, y: CRACKED.y1 + 0.2 } });
            for (let i = 0; i < 26; i++) {
              const paper = i >= 18;
              shards.push({
                x: CRACKED.x0 + game.rand() * (CRACKED.x1 - CRACKED.x0),
                y: CRACKED.y0 + game.rand() * (CRACKED.y1 - CRACKED.y0),
                vx: paper ? -0.6 - game.rand() * 0.8 : (game.rand() - 0.5) * 1.5,
                vy: paper ? 0.4 + game.rand() * 0.6 : game.rand() * 1.5,
                a: game.rand() * 6,
                paper,
              });
            }
          }
        }
        for (const s of shards) {
          // Glass drops; paper flutters off on the breeze.
          s.vy -= (s.paper ? 0.6 : 9.8) * dt;
          if (s.paper) s.vx += Math.sin(game.time * 3 + s.a) * 0.6 * dt;
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          s.a += dt * (s.paper ? 2 : 8);
        }
        for (let i = shards.length - 1; i >= 0; i--) if (shards[i].y < -1) shards.splice(i, 1);
        const wiping = moved / dt > WIPE_SPEED && onGlass(b) && !inCrack(b);
        if (wiping) {
          travelled += moved;
          const under = blobs.filter((d) => d.dirt > 0 && Math.hypot(d.x - b.x, d.y - b.y) < d.r + BLADE * 0.8);
          if (wet > 0) {
            wet = Math.max(0, wet - dt / WET_SECONDS);
            for (const d of under) {
              d.dirt = Math.max(0, d.dirt - dt / WIPE_TIME);
              // A last faint smudge counts as gone.
              if (d.dirt < 0.06) d.dirt = 0;
              if (d.dirt === 0 && d.spot) ev.push({ type: "score", text: "Squeaky!", pos: { x: d.x, y: d.y + 0.4 } });
            }
            // ...and soap left behind, wherever the blade's been.
            if (travelled > 0.09) {
              travelled = 0;
              suds.push({ x: b.x + (game.rand() - 0.5) * 0.2, y: b.y + (game.rand() - 0.5) * 0.08, age: 0 });
              if (suds.length > 260) suds.shift();
            }
          } else {
            // Dry: it picks the dirt up and spreads it about.
            if (under.length) {
              carry = Math.min(1, carry + dt * 3);
              for (const d of under) d.dirt = Math.max(0.3, d.dirt - dt * 0.2);
              if (!taught) {
                taught = true;
                ev.push({ type: "score", text: "Smeared it. Dip it in the suds!", pos: { x: b.x, y: b.y + 0.45 } });
              }
            }
            const smears = blobs.length - SPOTS.length;
            if (carry > 0 && travelled > SMEAR_EVERY && smears < 24) {
              travelled = 0;
              carry = Math.max(0, carry - 0.1);
              blobs.push({ x: b.x, y: b.y, r: 0.09 + game.rand() * 0.03, dirt: 0.7, spot: false, seed: game.rand() * 10 });
            }
          }
        }
        // Gone means gone: tidy away wiped-off smears.
        for (let i = blobs.length - 1; i >= 0; i--) if (!blobs[i].spot && blobs[i].dirt <= 0) blobs.splice(i, 1);

        // Drips off a wet blade; soap running down the glass.
        dripT += dt;
        if (wet > 0 && dripT > 0.18) {
          dripT = 0;
          drips.push({ x: b.x + (game.rand() - 0.5) * BLADE, y: b.y, vy: 0 });
        }
        for (const d of drips) {
          d.vy -= 9.8 * dt;
          d.y += d.vy * dt;
        }
        while (drips.length && drips[0].y < -0.5) drips.shift();
        for (const s of suds) {
          s.age += dt;
          if (s.age < 8) s.y -= 0.03 * dt;
        }
        return [...ev, ...gerald.update(game, dt)];
      },
      progress: () => {
        // Rounded up, so it only says 0% when it's actually done.
        const left = Math.ceil(grime() * 100 - 1e-6);
        const done = blobs.every((d) => d.dirt <= 0.06);
        const sq = state() === "wet" ? `💧 ${Math.ceil(wet * 100)}%` : state();
        return { done, label: done ? "Sparkling. Ish." : `Grime ${left}% · squeegee ${sq}` };
      },
      drawBack(r, game) {
        // The tower: the offices inside first, then the glass in front of them.
        r.rect(0, GLASS.y0 - 0.3, 8, GLASS.y1 + 0.3, "#4f6579");
        // Somebody's office on 49. They have a plant. It's fine.
        const o = pane(1, 4);
        r.rect(o.x0 + 0.15, o.y0, o.x0 + 0.95, o.y0 + 0.6, "#6b5646");
        r.rect(o.x0 + 0.25, o.y0 + 0.6, o.x0 + 0.65, o.y0 + 0.9, "#2a2f38");
        r.rect(o.x0 + 1.05, o.y0, o.x0 + 1.25, o.y0 + 0.35, "#8a5a3c");
        r.circle({ x: o.x0 + 1.15, y: o.y0 + 0.6 }, 0.24, "#5c9a5a");
        // Gerald's office on 50: Gerald, at his desk, with his mug.
        const go = pane(2, 4);
        const gx = go.x0 + 0.65;
        const gy = go.y0 + 0.7;
        r.rect(go.x0 + 0.1, go.y0 + 1.45, go.x0 + 0.6, go.y0 + 1.85, "#5b3a2a");
        r.roundRect(gx - 0.2, gy, gx + 0.2, gy + 0.42, 0.08, "#4a5160");
        r.poly([{ x: gx - 0.05, y: gy + 0.42 }, { x: gx + 0.05, y: gy + 0.42 }, { x: gx, y: gy + 0.25 }], "#f4f4f4");
        r.rect(gx - 0.015, gy + 0.18, gx + 0.015, gy + 0.38, "#c0392b");
        r.circle({ x: gx, y: gy + 0.6 }, 0.17, "#eebd92");
        r.poly([{ x: gx - 0.16, y: gy + 0.66 }, { x: gx + 0.16, y: gy + 0.67 }, { x: gx + 0.15, y: gy + 0.74 }, { x: gx - 0.1, y: gy + 0.76 }], "#9aa0a8");
        r.ring({ x: gx - 0.06, y: gy + 0.6 }, 0.045, "#2a2230", 0.012);
        r.ring({ x: gx + 0.06, y: gy + 0.6 }, 0.045, "#2a2230", 0.012);
        r.roundRect(gx - 0.08, gy + 0.49, gx + 0.08, gy + 0.52, 0.015, "#7a7f86");
        r.rect(go.x0 + 0.1, go.y0, go.x1 - 0.1, go.y0 + 0.72, "#6b4a3a");
        r.rect(go.x0 + 0.1, go.y0 + 0.66, go.x1 - 0.1, go.y0 + 0.72, "#82604c");
        // His mug, raised to you once you've noticed him.
        const lift = gerald.found ? Math.min(0.3, gerald.age * 0.6) : 0;
        r.roundRect(gx + 0.3, gy + 0.02 + lift, gx + 0.42, gy + 0.17 + lift, 0.02, "#f4f4f4");
        r.text("#1", { x: gx + 0.36, y: gy + 0.1 + lift }, 0.06, "#c0392b");
        for (let f = 0; f < 3; f++) {
          const y0 = deckTop(STOPS[f]) + 0.25;
          const y1 = y0 + 2.2;
          for (let i = 0; i < 5; i++) {
            const x0 = GLASS.x0 + i * 1.5;
            r.rect(x0 + 0.06, y0, x0 + 1.44, y1, "rgba(168,203,227,0.55)");
            // Reflections.
            r.poly([{ x: x0 + 0.3, y: y0 }, { x: x0 + 0.55, y: y0 }, { x: x0 + 1.2, y: y1 }, { x: x0 + 0.95, y: y1 }], "rgba(255,255,255,0.22)");
          }
          r.rect(0, y1, 8, y1 + 0.14, "#c9d4dd");
          r.text(`FL ${48 + f}`, { x: 7.3, y: y1 - 0.25 }, 0.12, "rgba(42,34,48,0.35)");
        }
        // The cracked pane: a spiderweb of cracks, and a strip of tape someone thought would help.
        const k = CRACKED;
        if (!shattered) {
          const hit = { x: k.x0 + 0.5, y: k.y0 + 1.3 };
          // The cracks reach further the more it's been scrubbed at.
          const grow = 1 + stress * 1.6;
          for (let i = 0; i < 9 + Math.floor(stress * 6); i++) {
            const a = i * 0.7 + 0.3;
            const len = (0.35 + ((i * 37) % 5) * 0.12) * grow;
            const mid = { x: hit.x + Math.cos(a) * len * 0.5 + 0.04, y: hit.y + Math.sin(a) * len * 0.5 };
            r.line(hit, mid, 0.012, "rgba(255,255,255,0.85)");
            r.line(mid, { x: hit.x + Math.cos(a + 0.15) * len, y: hit.y + Math.sin(a + 0.15) * len }, 0.01, "rgba(255,255,255,0.75)");
          }
          for (const rr of [0.12, 0.24]) r.ring(hit, rr, "rgba(255,255,255,0.55)", 0.008);
          r.poly([{ x: k.x0 + 0.85, y: k.y0 + 0.7 }, { x: k.x0 + 1.25, y: k.y0 + 1.15 }, { x: k.x0 + 1.18, y: k.y0 + 1.22 }, { x: k.x0 + 0.78, y: k.y0 + 0.77 }], "rgba(242,201,76,0.8)");
        } else {
          // Gone: the office behind, and a few jagged bits left in the frame.
          r.rect(k.x0, k.y0, k.x1, k.y1, "#3c4654");
          r.rect(k.x0 + 0.2, k.y0, k.x0 + 0.9, k.y0 + 0.55, "#5a4a3c");
          r.poly([{ x: k.x0, y: k.y1 }, { x: k.x0 + 0.4, y: k.y1 }, { x: k.x0, y: k.y1 - 0.5 }], "#a8cbe3");
          r.poly([{ x: k.x1, y: k.y0 }, { x: k.x1 - 0.5, y: k.y0 }, { x: k.x1, y: k.y0 + 0.35 }], "#a8cbe3");
          r.poly([{ x: k.x1, y: k.y1 }, { x: k.x1 - 0.25, y: k.y1 }, { x: k.x1, y: k.y1 - 0.7 }], "#a8cbe3");
        }
        // The dirt: brown splodges, and Stanley's smears.
        for (const d of blobs) {
          if (d.dirt <= 0) continue;
          const a = 0.8 * Math.min(1, d.dirt);
          const c = `rgba(112,82,46,${a})`;
          r.circle({ x: d.x, y: d.y }, d.r, c);
          if (d.spot) {
            r.circle({ x: d.x + Math.cos(d.seed) * d.r * 0.8, y: d.y + Math.sin(d.seed) * d.r * 0.7 }, d.r * 0.55, c);
            r.circle({ x: d.x - Math.cos(d.seed * 2) * d.r * 0.7, y: d.y - d.r * 0.6 }, d.r * 0.4, c);
          }
        }
        // Soap, left behind, running down the glass.
        for (const s of suds) {
          const a = Math.max(0.18, 0.55 - s.age * 0.03);
          r.circle(s, 0.07, `rgba(255,255,255,${a})`);
          r.line(s, { x: s.x, y: s.y - Math.min(0.3, s.age * 0.04) }, 0.025, `rgba(255,255,255,${a * 0.8})`);
        }
        // The cradle's cables, up to the roof.
        r.line({ x: CRADLE.x0 + 0.25, y }, { x: CRADLE.x0 + 0.25, y: 8.6 }, 0.025, "#5f6670");
        r.line({ x: CRADLE.x1 - 0.25, y }, { x: CRADLE.x1 - 0.25, y: 8.6 }, 0.025, "#5f6670");
        void game;
      },
      drawMid(r, game) {
        const deck = deckTop(y);
        // The deck and its rail.
        r.rect(CRADLE.x0, y - CRADLE.hh, CRADLE.x1, deck, "#5f6670");
        r.rect(CRADLE.x0, deck, CRADLE.x0 + 0.08, deck + 0.9, "#5f6670");
        r.rect(CRADLE.x0, deck + 0.84, CRADLE.x0 + 1.2, deck + 0.9, "#7a828c");
        // The control post, with its two big buttons.
        r.rect(CRADLE.x1 - 0.1, deck, CRADLE.x1, deck + 1.7, "#4a5160");
        const lit = (pad: "up" | "down") => (target !== stop && (pad === "up") === target > stop ? 1 : 0);
        for (const pad of ["up", "down"] as const) {
          const cy = deck + PADS[pad];
          const on = lit(pad) && Math.sin(game.time * 12) > 0;
          r.roundRect(PADS.x0, cy - PADS.hh, CRADLE.x1 - 0.1, cy + PADS.hh, 0.05, pad === "up" ? (on ? "#9df0a8" : "#37a59c") : on ? "#ffd08a" : "#e8913c");
          r.text(pad === "up" ? "▲" : "▼", { x: (PADS.x0 + CRADLE.x1 - 0.1) / 2, y: cy }, 0.16, "#ffffff");
        }
        r.text(`FL ${48 + stop}`, { x: (CRADLE.x0 + CRADLE.x1) / 2, y: y - 0.25 }, 0.13, "rgba(255,255,255,0.75)");
        // The squeegee's blade: blue and dripping when it's wet, brown when it's dragging dirt about.
        // Blue fading to grey as the suds run out (so a dip's due before it starts
        // smearing), brown when it's dragging dirt about.
        const mix = (a: number[], b: number[], k: number) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(",")})`;
        squeegee.color = carry > 0.05 ? mix([58, 63, 72], [138, 106, 64], Math.min(1, carry * 2)) : mix([58, 63, 72], [93, 173, 232], Math.min(1, wet * 1.15));
        for (const d of drips) r.circle(d, 0.025, "rgba(93,173,232,0.8)");
        for (const sh of shards) {
          if (sh.paper) {
            const c = Math.cos(sh.a) * 0.09;
            r.poly([{ x: sh.x - c, y: sh.y - 0.06 }, { x: sh.x + c, y: sh.y - 0.06 }, { x: sh.x + c, y: sh.y + 0.06 }, { x: sh.x - c, y: sh.y + 0.06 }], "#f4f4f4");
          } else r.poly([{ x: sh.x, y: sh.y + 0.05 }, { x: sh.x + Math.cos(sh.a) * 0.06, y: sh.y - 0.03 }, { x: sh.x - 0.04, y: sh.y - Math.sin(sh.a) * 0.04 }], "rgba(200,230,250,0.9)");
        }
      },
    };
  },
};
