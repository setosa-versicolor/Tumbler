import { type Level, type LevelInstance } from "../level";
import { shatter, type Prop } from "../kit";
import type { Game, GameEvent } from "../../sim/game";
import type { Renderer } from "../../render/renderer";
import { Liquid, type Drop } from "../liquid";
import { drawCoworkerHead } from "../../render/characters";
import { CHAMPAGNE, drawLiquid, drawShine } from "../../hd/shared";
import type { Vec } from "../../sim/math";
import { groups, G_FLOOR, G_FURNITURE, G_PROP, G_WORLD } from "../../physics/groups";

// CEO Life: the company jet. Pour the board a glass of champagne each. The
// bottle points where your arm points: tip it over a glass and it pours. Then
// the turbulence starts.

const W = 16;
const H = 3.0;
const BAR = { x0: 0.3, x1: 1.75, top: 0.9 };
const BUCKET = { x: 1.55, hw: 0.075, h: 0.24 };
const TABLE = { x0: 5.6, x1: 8.0, top: 0.5 };
/** Where the glasses stand on the table. */
export const SLOTS = [6.15, 6.8];
/** How many drops fill a glass. */
export const GLASS_FULL = 18;
/** Passengers' seats (x). Each has a drinks ledge in front, with their own glass on it. */
const SEATS = [9.8, 12.2, 14.4];
const LEDGE = { top: 0.66, dx: -0.58, hw: 0.17 };
const ledgeX = (i: number) => SEATS[i] + LEDGE.dx;

/** What the board say when you miss their glass, fill it past full, or get it on them. And, grudgingly, when you don't. */
export const REMARKS = {
  miss: [
    "The glass is the tall thing, Stanley.",
    "Interesting technique.",
    "I'll just lick it off the ledge, shall I?",
    "That's the carpet's drink now.",
    "Do they not have glasses where you're from?",
    "Aim, Stanley. It's in the job title.",
    "And they made you CEO.",
  ],
  full: ["I said when.", "It's full. It was full a while ago.", "Are you trying to drown me?", "Stanley. STANLEY. Full."],
  suit: ["ON THE SUIT?!", "This suit is Italian.", "I'll be invoicing you for that.", "Dry clean only, Stanley.", "Not the cufflinks!"],
  thanks: ["Finally.", "Adequate.", "Mm. Acceptable.", "Took you long enough.", "I've had worse. Not recently."],
};
type Remark = keyof typeof REMARKS;
/** The captain's warning before the really bad stuff. */
const CAPTAIN = "Captain here: hold on to something.";
const WINDOWS = [3.4, 4.9, 9.0, 10.6, 12.2, 13.8];

type Phase = "calm" | "warning" | "bumpy" | "finale";

export const jet: Level = {
  id: "ceo-jet",
  title: "Champagne Flight",
  goal: "The company jet. Pour the board a glass each. Mind the turbulence.",
  hint: "Hold grab on the bottle to pick it up · Point it down over a glass to pour · When the seatbelt sign comes on, hold steady",
  icon: "✈️",
  par: [0, 0],
  sandbox: true,
  ceo: true,
  bounds: { w: W, h: H },
  viewHeight: 3.6,
  spawn: { x: 2.7, y: 0 },
  theme: { outdoor: false, top: "#f3ece0", bottom: "#e6dccb", floor: "#4b3f55", floorTop: "#6a5a78" },
  build(kit) {
    kit.enclosure(W, H);
    kit.solid((BAR.x0 + BAR.x1) / 2, BAR.top / 2, (BAR.x1 - BAR.x0) / 2, BAR.top / 2, "counter", { hidden: true });
    kit.solid((TABLE.x0 + TABLE.x1) / 2, TABLE.top / 2, (TABLE.x1 - TABLE.x0) / 2, TABLE.top / 2, "desk", { hidden: true });
    // Brass rails round the table's edge (glasses slide, but don't go over), and the ice bucket the bottle stands in.
    for (const x of [TABLE.x0 + 0.02, TABLE.x1 - 0.02]) kit.solid(x, TABLE.top + 0.04, 0.015, 0.04, "ground", { collides: "props", hidden: true });
    kit.solid(BUCKET.x, BAR.top + 0.01, BUCKET.hw + 0.02, 0.01, "ground", { collides: "props", hidden: true });
    for (const s of [-1, 1]) kit.solid(BUCKET.x + s * BUCKET.hw, BAR.top + BUCKET.h / 2, 0.012, BUCKET.h / 2, "ground", { collides: "props", hidden: true });
    const bottle = kit.box(BUCKET.x, BAR.top + 0.03 + 0.2, 0.05, 0.2, { kind: "champagne", density: 9, friction: 0.8, color: "#1f4a33" });
    // Held by its base, pointing on out along the forearm: point down over a glass and it pours.
    bottle.body.userData = { tool: true };
    // The drinks ledges in front of the board's seats (only glasses feel them: Stanley walks along the aisle past them).
    for (let i = 0; i < SEATS.length; i++) {
      kit.solid(ledgeX(i), LEDGE.top - 0.02, LEDGE.hw, 0.02, "ground", { collides: "props", hidden: true });
      for (const s of [-1, 1]) kit.solid(ledgeX(i) + s * (LEDGE.hw - 0.015), LEDGE.top + 0.03, 0.012, 0.03, "ground", { collides: "props", hidden: true });
    }
    type Glass = { prop: Prop; home: Vec; owner: number; fill: number; full: number; floor: number; gone: boolean };
    const flute = (x: number, y: number) => kit.box(x, y, 0.035, 0.1, { kind: "flute", density: 5, friction: 1.1, color: "#e1eef8" });
    const glasses: Glass[] = [
      ...SLOTS.map((x) => ({ x, y: TABLE.top + 0.105, owner: -1 })),
      ...SEATS.map((_, i) => ({ x: ledgeX(i), y: LEDGE.top + 0.105, owner: i })),
    ].map(({ x, y, owner }) => ({ prop: flute(x, y), home: { x, y }, owner, fill: 0, full: -1, floor: 0, gone: false }));
    // The board's glasses sit out of Stanley's way (he walks the aisle past them): only the bottle,
    // other glasses and the turbulence can knock them over. The table's two are fair game.
    for (const g of glasses) {
      if (g.owner < 0) continue;
      const c = g.prop.body.collider(0);
      c.setCollisionGroups(groups(G_PROP, G_WORLD | G_FLOOR | G_PROP | G_FURNITURE));
    }

    /** Does a glass catch this drop? (Into its mouth, upright, not yet full.) */
    const absorb = (d: Drop) => {
      for (const g of glasses) {
        if (g.gone || g.fill >= GLASS_FULL || g.full >= 0) continue;
        const b = g.prop.body;
        const a = b.rotation();
        if (Math.abs(a) > 0.5) continue;
        const t = b.translation();
        const dx = d.x - t.x;
        const dy = d.y - t.y;
        const lx = dx * Math.cos(a) + dy * Math.sin(a);
        const ly = -dx * Math.sin(a) + dy * Math.cos(a);
        if (Math.abs(lx) < g.prop.hw * 1.5 && ly > 0 && ly < g.prop.hh + 0.12 && d.vy < 0.5) {
          g.fill++;
          return true;
        }
      }
      return false;
    };
    const fizz = new Liquid("none", { absorb, ignore: (p) => p === bottle });

    let phase: Phase = "calm";
    let t = 0;
    let calmFor = 7;
    let pocket = 0;
    let poured = 0;
    let shakeT = 0;
    let bottleDown = 0;
    let now: Game | null = null;
    const turb = { x: 0, y: 0 };
    /** This bout's a bad one: harder bumps, and one jolt that sends the bottle flying. */
    let severe = false;
    let bouts = 0;
    let jolt = 0;
    let jolted = false;
    /** Seconds the bottle's been flying loose (it sprays). */
    let flung = 0;
    let ended = false;
    /** Each passenger's tally of the drops you've got wrong lately, and when they last said something. */
    const board = SEATS.map(() => ({ miss: 0, full: 0, suit: 0, quiet: 0, said: 0 }));
    const counted = new WeakSet<Drop>();
    const remark = (game: Game, i: number, kind: Remark): GameEvent => {
      const lines = REMARKS[kind];
      const line = lines[(board[i].said * 3 + i * 2 + Math.floor(game.rand() * 2)) % lines.length];
      board[i].said++;
      board[i].quiet = 3;
      return { type: "score", text: line, pos: { x: SEATS[i], y: 2.05 } };
    };
    const startTurbulence = (bad: boolean) => {
      phase = "warning";
      t = 0;
      bouts++;
      severe = bad;
    };

    const LINES = ["Is this normal?", "Hold it level, Stanley!", "The board loves a bumpy ride.", "Was that the wing?", "My caviar!", "Someone tell the pilot we're pouring."];
    const CHEERS = ["Cheers!", "To the CEO!", "Bubbly!", "To record profits!", "Lovely. Another?"];

    const inst: LevelInstance & {
      bottle: Prop;
      glasses: Glass[];
      fizz: Liquid;
      phase: () => Phase;
      severe: () => boolean;
      poured: () => number;
      /** Start a bout of turbulence now (tests). */
      turbulence: (bad: boolean) => void;
    } = {
      bottle,
      glasses,
      fizz,
      phase: () => phase,
      severe: () => severe,
      poured: () => poured,
      turbulence: (bad) => {
        startTurbulence(bad);
      },
      update(game, dt): GameEvent[] {
        now = game;
        const ev: GameEvent[] = [];
        t += dt;

        // --- The finale: one glass from done, the biggest air pocket of all. Everything goes up; the glasses meet the ceiling.
        if (phase !== "finale") {
          const left = glasses.filter((g) => g.full < 0);
          if (left.length === 1 && left[0].fill >= GLASS_FULL * 0.6) {
            phase = "finale";
            t = 0;
            flung = 0;
            if (game.held.has(bottle.body)) game.stanley.letGo(bottle.body);
            for (const b of [...game.stanley.rig.bodies, ...game.props.map((p) => p.body)]) {
              if (!b.isDynamic()) continue;
              const v = b.linvel();
              b.setLinvel({ x: v.x + (game.rand() - 0.5) * 2, y: 9 + game.rand() * 3 }, true);
            }
            ev.push({ type: "ouch", text: "AIR POCKET!", pos: { x: game.stanley.position.x, y: H - 0.5 } });
            ev.push({ type: "shake", mag: 36 });
            ev.push({ type: "sfx", name: "boom" });
          }
        }
        if (phase === "finale") {
          turb.x = 0;
          turb.y = t < 0.5 ? 14 : 0;
          if (turb.y) for (const b of [...game.stanley.rig.bodies, ...game.props.map((p) => p.body)]) if (b.isDynamic()) b.applyImpulse({ x: 0, y: b.mass() * turb.y * dt }, true);
          // Every glass, against the ceiling (or near enough): smash, and whatever was in it rains back down.
          for (const g of glasses) {
            if (g.gone) continue;
            const q = g.prop.body.translation();
            if (q.y < H - 0.4 && t < 0.9) continue;
            g.gone = true;
            for (let i = 0; i < Math.max(4, g.fill); i++) fizz.add(q.x + (game.rand() - 0.5) * 0.08, q.y, (game.rand() - 0.5) * 2, -game.rand() * 2);
            g.fill = 0;
            const shards = shatter(game.world, g.prop, game.rand);
            game.props = game.props.filter((p) => p !== g.prop).concat(shards);
            ev.push({ type: "break", pos: { ...q }, kind: "cup" });
          }
          if (!ended && glasses.every((g) => g.gone)) {
            ended = true;
            ev.push({
              type: "disaster",
              title: "Air Pocket",
              text: "Five glasses of vintage champagne, poured to perfection, and one ceiling. The board would like a word. Several words. Mostly from the one in the wet suit.",
            });
          }
          fizz.extra = { x: 0, y: 0 };
          ev.push(...fizz.update(game, dt));
          return ev;
        }

        // --- Turbulence: calm, a chime and the seatbelt sign, then a few seconds of bumps.
        // About one bout in three is a bad one (and never more than two mild ones in a row).
        if (phase === "calm" && t > calmFor) startTurbulence(game.rand() < 0.3 || bouts % 3 === 2);
        if (phase === "warning" && t === dt) {
          ev.push({ type: "sfx", name: "alarm" });
          if (severe) ev.push({ type: "score", text: CAPTAIN, pos: { x: 7.9, y: H - 0.75 } });
        }
        if (phase === "warning" && t > (severe ? 1.8 : 1.3)) {
          phase = "bumpy";
          t = 0;
          pocket = 0.8 + game.rand() * 1.8;
          jolt = 1.0 + game.rand() * 1.2;
          jolted = false;
          const p = SEATS[Math.floor(game.rand() * SEATS.length)];
          ev.push({ type: "score", text: LINES[Math.floor(game.rand() * LINES.length)], pos: { x: p, y: 2.2 } });
        } else if (phase === "bumpy" && t > (severe ? 4.4 : 3.6)) {
          phase = "calm";
          t = 0;
          calmFor = 6 + game.rand() * 5;
        }
        if (phase === "bumpy") {
          // Side to side and up and down, and once in a while an air pocket (everything lifts).
          const k = severe ? 1.6 : 1;
          turb.x = k * (4.2 * Math.sin(t * 6.3) + 2.2 * Math.sin(t * 14.1 + 1));
          turb.y = k * 3.5 * Math.sin(t * 9.7) + (Math.abs(t - pocket) < 0.25 ? 9 : 0);
          // The bad one: a single huge jolt. It tears the bottle out of his hand (or out of the ice) and across the cabin.
          if (severe && !jolted && t > jolt) {
            jolted = true;
            ev.push({ type: "shake", mag: 34 });
            ev.push({ type: "sfx", name: "boom" });
            const held = game.held.has(bottle.body);
            if (held) game.stanley.letGo(bottle.body);
            const m = bottle.body.mass();
            // Away from him (out of his hands, not into his chest).
            const side = held ? Math.sign(bottle.body.translation().x - game.stanley.rig.chest.translation().x) || 1 : game.rand() < 0.5 ? -1 : 1;
            bottle.body.applyImpulse({ x: m * side * (held ? 9 : 4.5), y: m * (held ? 4 : 6) }, true);
            bottle.body.setAngvel(side * -(10 + game.rand() * 6), true);
            flung = 1.8;
            // (Out of reach for a moment: a hand still closed on nothing doesn't just catch it again.)
            bottle.body.userData = { tool: true, noGrab: true };
            const bp = bottle.body.translation();
            ev.push({ type: "ouch", text: "THE BOTTLE!", pos: { x: bp.x, y: Math.min(H - 0.4, bp.y + 0.8) } });
          }
          if (severe && t > jolt && t < jolt + 0.18) turb.y += 14;
          shakeT -= dt;
          if (shakeT <= 0) {
            shakeT = 0.22;
            ev.push({ type: "shake", mag: 5 + Math.abs(turb.y) * 0.6 });
          }
          if (Math.abs(t - pocket) < dt) ev.push({ type: "sfx", name: "rumble" });
        } else {
          turb.x = 0;
          turb.y = 0;
        }
        if (turb.x || turb.y) {
          // (The glasses, low and gripping on the tablecloth, feel the sideways part less: they wobble, and only sometimes go over.)
          for (const b of game.stanley.rig.bodies) b.applyImpulse({ x: b.mass() * turb.x * dt, y: b.mass() * turb.y * dt }, true);
          for (const p of game.props) {
            const k = p.kind === "flute" ? 0.4 : 1;
            if (p.body.isDynamic()) p.body.applyImpulse({ x: p.body.mass() * turb.x * k * dt, y: p.body.mass() * turb.y * dt }, true);
          }
        }
        fizz.extra = turb;

        // --- Pouring: the bottle, held and pointing down, pours from its neck.
        const held = game.held.has(bottle.body);
        const a = bottle.body.rotation();
        const dir = { x: -Math.sin(a), y: Math.cos(a) };
        if (held && dir.y < -0.12) {
          const rate = 70 * Math.min(1, (-dir.y - 0.12) / 0.5);
          const n = Math.floor(rate * dt + game.rand());
          const tip = bottle.body.translation();
          const bv = bottle.body.linvel();
          for (let i = 0; i < n; i++) {
            const mouth = { x: tip.x + dir.x * (bottle.hh + 0.02), y: tip.y + dir.y * (bottle.hh + 0.02) };
            fizz.add(mouth.x + (game.rand() - 0.5) * 0.02, mouth.y, bv.x + dir.x * 0.6 + (game.rand() - 0.5) * 0.1, bv.y + dir.y * 0.6);
          }
        }
        // Flying loose after the jolt: it sprays from the neck as it tumbles.
        if (flung > 0) {
          flung -= dt;
          if (flung <= 0.6) bottle.body.userData = { tool: true };
          const v = bottle.body.linvel();
          if (!held && Math.hypot(v.x, v.y) > 1.5) {
            const n = Math.floor(55 * dt + game.rand());
            const tip = bottle.body.translation();
            for (let i = 0; i < n; i++) {
              const sp = 1 + game.rand();
              fizz.add(tip.x + dir.x * (bottle.hh + 0.02), tip.y + dir.y * (bottle.hh + 0.02), v.x * 0.5 + dir.x * sp, v.y * 0.5 + dir.y * sp);
            }
          }
          if (game.held.has(bottle.body)) flung = 0;
        }
        ev.push(...fizz.update(game, dt));
        // --- The board, watching every drop. One that's got past a glass (falling by it, onto a full one, or on them) is noted.
        for (const d of fizz.drops) {
          if (counted.has(d) || d.vy > 0) continue;
          for (let i = 0; i < SEATS.length; i++) {
            const gx = ledgeX(i);
            const onSuit = d.x > SEATS[i] - 0.25 && d.x < SEATS[i] + 0.3 && d.y > 0.6 && d.y < 1.6;
            const byGlass = Math.abs(d.x - gx) < 0.32 && d.y < LEDGE.top + 0.25 && d.y > LEDGE.top - 0.1;
            if (!onSuit && !byGlass) continue;
            counted.add(d);
            const g = glasses.find((gl) => gl.owner === i)!;
            const done = g.fill >= GLASS_FULL || g.full >= 0;
            board[i][onSuit ? "suit" : done && Math.abs(d.x - gx) < 0.08 ? "full" : "miss"]++;
            break;
          }
        }
        for (let i = 0; i < SEATS.length; i++) {
          const b = board[i];
          b.quiet = Math.max(0, b.quiet - dt);
          if (b.quiet > 0) continue;
          const kind: Remark | null = b.suit >= 2 ? "suit" : b.full >= 4 ? "full" : b.miss >= 4 ? "miss" : null;
          if (!kind) continue;
          ev.push(remark(game, i, kind));
          b.miss = b.full = b.suit = 0;
        }
        // Put down somewhere (or dropped on the floor) a while: the steward puts it back on ice.
        const bp = bottle.body.translation();
        bottleDown = !held && (bp.y < BAR.top - 0.2 || Math.abs(bp.x - BUCKET.x) > 0.3) ? bottleDown + dt : 0;
        // (Out through the floor, it doesn't wait.)
        if (bottleDown > 2.5 || (!held && bp.y < -0.3)) {
          bottleDown = 0;
          place(bottle, BUCKET.x, BAR.top + 0.03 + bottle.hh);
        }

        // --- The glasses: full, a toast (and a fresh one); knocked over, it's spilt; on the floor, tidied away.
        for (const g of glasses) {
          if (g.gone) continue;
          const b = g.prop.body;
          const p = b.translation();
          if (Math.abs(b.rotation()) > 0.9 && g.fill > 0) {
            for (let i = 0; i < g.fill; i++) fizz.add(p.x + (game.rand() - 0.5) * 0.05, p.y + 0.05, b.linvel().x + (game.rand() - 0.5), 0.3 + game.rand());
            g.fill = 0;
            // Spilt: it needs pouring again.
            g.full = -1;
          }
          if (g.fill >= GLASS_FULL && g.full < 0) {
            g.full = 0;
            poured++;
            if (g.owner >= 0) {
              // Theirs: a grudging word, and they keep it a moment longer (they're drinking it).
              ev.push(remark(game, g.owner, "thanks"));
              board[g.owner].miss = board[g.owner].full = 0;
            } else ev.push({ type: "score", text: CHEERS[poured % CHEERS.length], pos: { x: p.x, y: 1.6 } });
          }
          // Full, it stays full (and poured), till it's drunk (never) or spilt.
          if (g.full >= 0) g.full += dt;
          g.floor = p.y < g.home.y - 0.2 || Math.abs(b.rotation()) > 1.2 ? g.floor + dt : 0;
          if (g.floor > 2.5) {
            g.floor = 0;
            g.fill = 0;
            place(g.prop, g.home.x, g.home.y);
          }
        }
        return ev;
      },
      progress: () => ({
        done: false,
        label:
          phase === "finale"
            ? "⚠⚠⚠"
            : `${phase === "bumpy" ? "⚠ Turbulence! · " : phase === "warning" ? "🔔 Seatbelt sign's on · " : ""}Glasses poured: ${glasses.filter((g) => g.full >= 0).length} of ${glasses.length}`,
      }),
      drawBack(r) {
        drawCabin(r, now, phase);
      },
      drawMid(r) {
        // What's in each glass, then any champagne in flight or on the floor.
        for (const g of glasses) if (!g.gone) drawFill(r, g.prop, g.fill);
        drawLiquid(r, fizz, CHAMPAGNE);
      },
      drawFront(r) {
        drawShine(r, fizz, CHAMPAGNE);
      },
      safe: () => true,
    };
    return inst;
  },
};

/** Put a prop back, upright and still. */
function place(p: Prop, x: number, y: number) {
  p.body.setTranslation({ x, y }, true);
  p.body.setRotation(0, true);
  p.body.setLinvel({ x: 0, y: 0 }, true);
  p.body.setAngvel(0, true);
}

// ---------------------------------------------------------------- art ---

function drawCabin(r: Renderer, game: Game | null, phase: Phase) {
  const time = r.clock;
  // Cream panels, a walnut strip, the curve of the ceiling, the carpet.
  r.rect(0, 0, W, H, "#efe6d8");
  r.rect(0, 0.78, W, 0.86, "#7a4f33");
  r.rect(0, 0, W, 0.5, "#e2d6c2");
  r.rect(0, H - 0.25, W, H, "#d9cdb8");
  r.rect(0, H - 0.27, W, H - 0.25, "#b9a88c");
  // Above the ceiling line: the overhead lockers, with reading lights.
  r.rect(-1, H, W + 1, H + 3, "#e6dccb");
  for (let x = 0.2; x < W; x += 1.6) {
    r.roundRect(x, H + 0.08, x + 1.45, H + 0.62, 0.06, "#f3ece0");
    r.rect(x + 0.55, H + 0.12, x + 0.9, H + 0.16, "#b9a88c");
    r.circle({ x: x + 0.72, y: H + 0.02 }, 0.03, "rgba(255,236,180,0.95)");
  }
  r.rect(-1, H + 0.7, W + 1, H + 3, "#d9cdb8");
  // Oval windows: the sky, clouds racing past (darker and bobbing when it's bumpy).
  const bumpy = phase === "bumpy";
  for (const x of WINDOWS) {
    const c = { x, y: 1.75 };
    r.roundRect(x - 0.24, c.y - 0.34, x + 0.24, c.y + 0.34, 0.2, "#b9a88c");
    r.roundRect(x - 0.19, c.y - 0.29, x + 0.19, c.y + 0.29, 0.17, bumpy ? "#6b86a8" : "#7fb6e8");
    const ctx = r.ctx;
    const a = r.camera.toScreen({ x: x - 0.19, y: c.y + 0.29 });
    const b = r.camera.toScreen({ x: x + 0.19, y: c.y - 0.29 });
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(a.x, a.y, b.x - a.x, b.y - a.y, 0.17 * r.camera.scale);
    ctx.clip();
    for (let k = 0; k < 3; k++) {
      const cx = x + 0.4 - (((time * (1.2 + k * 0.6) + k * 0.37 + x * 0.13) % 1) * 0.8);
      const cy = c.y - 0.15 + k * 0.14 + (bumpy ? Math.sin(time * 9 + k) * 0.05 : 0);
      r.circle({ x: cx, y: cy }, 0.07 + k * 0.02, bumpy ? "rgba(200,205,215,0.9)" : "rgba(255,255,255,0.9)");
      r.circle({ x: cx + 0.08, y: cy + 0.02 }, 0.06 + k * 0.02, bumpy ? "rgba(200,205,215,0.9)" : "rgba(255,255,255,0.9)");
    }
    ctx.restore();
  }
  // The seatbelt sign.
  const lit = phase !== "calm" && Math.floor(time * 3) % 2 === 0;
  r.roundRect(7.4, H - 0.48, 8.4, H - 0.3, 0.04, "#2a2230");
  r.text(lit ? "🔔 FASTEN SEATBELTS" : "FASTEN SEATBELTS", { x: 7.9, y: H - 0.39 }, 0.075, lit ? "#ffd84a" : "#5f6670");
  // The galley bar and its ice bucket; the table; the seats, with the board in them.
  r.rect(BAR.x0, 0, BAR.x1, BAR.top, "#6b4430");
  r.rect(BAR.x0 - 0.05, BAR.top - 0.05, BAR.x1 + 0.05, BAR.top, "#d9c9a8");
  r.rect(BAR.x0 + 0.1, 0.15, BAR.x1 - 0.1, BAR.top - 0.15, "#5d3a29");
  r.roundRect(BUCKET.x - BUCKET.hw - 0.02, BAR.top, BUCKET.x + BUCKET.hw + 0.02, BAR.top + BUCKET.h, 0.03, "#c9ccd1");
  for (let i = 0; i < 4; i++) r.rect(BUCKET.x - BUCKET.hw + i * 0.04, BAR.top + BUCKET.h - 0.04, BUCKET.x - BUCKET.hw + i * 0.04 + 0.03, BAR.top + BUCKET.h, "rgba(220,240,255,0.9)");
  r.rect(TABLE.x0, TABLE.top - 0.06, TABLE.x1, TABLE.top, "#6b4430");
  r.rect((TABLE.x0 + TABLE.x1) / 2 - 0.06, 0, (TABLE.x0 + TABLE.x1) / 2 + 0.06, TABLE.top - 0.06, "#8a9099");
  for (const x of [TABLE.x0 + 0.02, TABLE.x1 - 0.02]) r.rect(x - 0.015, TABLE.top, x + 0.015, TABLE.top + 0.08, "#d4a53a");
  r.rect(TABLE.x0, TABLE.top + 0.07, TABLE.x1, TABLE.top + 0.085, "#d4a53a");
  const look = game?.stanley.rig.head.translation() ?? { x: 0, y: 0 };
  SEATS.forEach((x, i) => {
    // The seat back, the passenger (a suit, a head), the armrest in front.
    r.roundRect(x - 0.05, 0.42, x + 0.45, 1.55, 0.12, "#e8dcc5");
    r.roundRect(x - 0.32, 0.42, x + 0.25, 0.62, 0.06, "#e8dcc5");
    r.roundRect(x - 0.2, 0.6, x + 0.25, 1.15, 0.1, i % 2 ? "#2f3b55" : "#3a2f45");
    r.rect(x - 0.32, 0.6, x - 0.12, 0.66, "#2f3b55");
    const bob = phase === "bumpy" ? Math.sin(time * 11 + i) * 0.03 : 0;
    drawCoworkerHead(r, x + 0.02, 1.35 + bob, i === 1 ? "#8a5a3c" : "#f2c79b", i === 1 ? "#2a2230" : i === 2 ? "#9a9aa0" : "#c58be8", look as Vec, i % 2);
    r.roundRect(x - 0.4, 0.62, x - 0.2, 0.72, 0.03, "#d2c4a8");
    // Their drinks ledge: walnut, a brass lip, on a post.
    const lx = ledgeX(i);
    r.rect(lx - 0.02, 0, lx + 0.02, LEDGE.top - 0.04, "#8a9099");
    r.rect(lx - LEDGE.hw, LEDGE.top - 0.045, lx + LEDGE.hw, LEDGE.top, "#6b4430");
    r.rect(lx - LEDGE.hw, LEDGE.top + 0.05, lx + LEDGE.hw, LEDGE.top + 0.06, "#d4a53a");
    for (const s of [-1, 1]) r.rect(lx + s * (LEDGE.hw - 0.015) - 0.01, LEDGE.top, lx + s * (LEDGE.hw - 0.015) + 0.01, LEDGE.top + 0.06, "#d4a53a");
  });
}

/** The champagne in a glass: a level that stays level, and bubbles. */
function drawFill(r: Renderer, glass: Prop, fill: number) {
  if (fill <= 0) return;
  const b = glass.body;
  const p = b.translation();
  const a = b.rotation();
  const k = Math.min(1, fill / GLASS_FULL);
  const ctx = r.ctx;
  const s = r.camera.toScreen(p);
  const sc = r.camera.scale;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(-a);
  const w = glass.hw * sc;
  const h = glass.hh * sc;
  // The bowl's inside, filled from its base up.
  ctx.beginPath();
  ctx.moveTo(-w * 0.8, -h);
  ctx.quadraticCurveTo(-w * 0.95, -h * 0.1, 0, h * 0.05);
  ctx.quadraticCurveTo(w * 0.95, -h * 0.1, w * 0.8, -h);
  ctx.closePath();
  ctx.clip();
  const top = h * 0.05 - (h * 1.05 * k);
  ctx.fillStyle = "rgba(240,205,110,0.9)";
  ctx.fillRect(-w, top, w * 2, h * 2);
  ctx.fillStyle = "rgba(255,250,225,0.9)";
  ctx.fillRect(-w, top - 1.5, w * 2, 3);
  for (let i = 0; i < 5; i++) {
    const bx = ((i * 37) % 10) / 10 - 0.5;
    const by = ((r.clock * (0.8 + i * 0.13) + i * 0.3) % 1) * (h * 0.05 - top);
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillRect(bx * w, h * 0.05 - by, 1.5, 1.5);
  }
  ctx.restore();
}
