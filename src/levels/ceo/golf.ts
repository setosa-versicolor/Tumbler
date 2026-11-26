import type { Collider } from "@dimforge/rapier2d-deterministic-compat";
import { OUTDOOR, type Level, type LevelInstance } from "../level";
import type { Kit, Prop } from "../kit";
import type { Game, GameEvent } from "../../sim/game";
import type { Renderer } from "../../render/renderer";
import { RAPIER } from "../../physics/world";
import { G_PROP, PROP_GROUPS, groups } from "../../physics/groups";
import type { Vec } from "../../sim/math";
import { drawCoworkerHead } from "../../render/characters";

// CEO Life: golf. Three holes on the company course. Pick up the club, swing
// it with your arms (point and sweep: a big, fast swing hits it far), and get
// the ball in the cup. Nobody's keeping score. Well: you are.

const W = 104;
/** A swung club hits golf balls (and nothing else: it passes through the ground, and Stanley). */
const CLUB_SWING = groups(G_PROP, G_PROP);
const BALL_R = 0.035;
const CUP_HW = 0.08;
const GREEN_H = 0.22;
/** The golf bag: half its inner width, its height, and its floor. */
const BAG = { hw: 0.07, h: 0.55, floor: 0.02 };

export interface Hole {
  n: number;
  par: number;
  tee: number;
  cup: number;
  /** The raised green, either side of the cup. */
  green: [number, number];
  /** Sand: [x0, x1]. */
  sand?: [number, number];
}

export const HOLES: Hole[] = [
  { n: 1, par: 3, tee: 3, cup: 27, green: [23, 30] },
  { n: 2, par: 4, tee: 35, cup: 66, green: [61, 69], sand: [45, 48.5] },
  { n: 3, par: 4, tee: 74, cup: 99, green: [95, 102], sand: [90.5, 93.5] },
];
export const PAR = HOLES.reduce((s, h) => s + h.par, 0);

/** Hills on the fairways (the greens are separate): [x, height] corners. */
const HILLS: [number, number][][] = [
  [[11, 0], [14, 0.55], [17, 0]],
  [[51, 0], [55, 1.1], [58, 0]],
  [[79, 0], [82, 0.7], [84, 0.7], [87.5, 0]],
];

/** Hard ground along a run of corners: each sloping or raised stretch is a thin rotated box, filled in underneath. */
function slope(kit: Kit, pts: [number, number][]) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    if (y0 === 0 && y1 === 0) continue;
    const len = Math.hypot(x1 - x0, y1 - y0);
    const a = Math.atan2(y1 - y0, x1 - x0);
    const hh = 0.1;
    kit.solid((x0 + x1) / 2 + Math.sin(a) * hh, (y0 + y1) / 2 - Math.cos(a) * hh, len / 2, hh, "ground", { angle: a, hidden: true, friction: 0.9 });
    const low = Math.min(y0, y1);
    if (low > 0.05) kit.solid((x0 + x1) / 2, low / 2, (x1 - x0) / 2, low / 2, "ground", { hidden: true });
    else if (y0 !== y1) {
      const xh = y1 > y0 ? x1 : x0;
      const top = Math.max(y0, y1);
      kit.solid(xh, top / 2, 0.05, top / 2, "ground", { hidden: true });
    }
  }
}

/** Height of the ground at x (hills and greens; the cup's a hole in it). */
export function groundY(x: number): number {
  for (const hill of HILLS)
    for (let i = 0; i < hill.length - 1; i++) {
      const [x0, y0] = hill[i];
      const [x1, y1] = hill[i + 1];
      if (x >= x0 && x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  for (const h of HOLES) {
    const [g0, g1] = h.green;
    if (x >= g0 - 0.6 && x <= g0) return ((x - (g0 - 0.6)) / 0.6) * GREEN_H;
    if (x >= g1 && x <= g1 + 0.6) return (1 - (x - g1) / 0.6) * GREEN_H;
    if (x > g0 && x < g1) return Math.abs(x - h.cup) < CUP_HW ? GREEN_H - 0.14 : GREEN_H;
  }
  return 0;
}

function buildCourse(kit: Kit) {
  for (const hill of HILLS) slope(kit, hill);
  for (const h of HOLES) {
    const [g0, g1] = h.green;
    // Ramps up and down at the ends, the green either side of the cup, and the cup's floor.
    slope(kit, [[g0 - 0.6, 0], [g0, GREEN_H]]);
    slope(kit, [[g1, GREEN_H], [g1 + 0.6, 0]]);
    kit.solid((g0 + h.cup - CUP_HW) / 2, GREEN_H / 2, (h.cup - CUP_HW - g0) / 2, GREEN_H / 2, "ground", { hidden: true, friction: 0.7 });
    kit.solid((h.cup + CUP_HW + g1) / 2, GREEN_H / 2, (g1 - h.cup - CUP_HW) / 2, GREEN_H / 2, "ground", { hidden: true, friction: 0.7 });
    kit.solid(h.cup, (GREEN_H - 0.14) / 2, CUP_HW + 0.01, (GREEN_H - 0.14) / 2, "ground", { hidden: true });
  }
}

export const golf: Level = {
  id: "ceo-golf",
  title: "Golf",
  goal: "Three holes on the company course. Pick up the club and swing.",
  hint: "Hold grab on the club to pick it up · Point and sweep the mouse (or right thumb) to swing: big and fast goes far",
  icon: "⛳",
  par: [0, 0],
  sandbox: true,
  ceo: true,
  bounds: { w: W, h: 6 },
  viewHeight: 5,
  spawn: { x: HOLES[0].tee - 0.9, y: 0 },
  theme: { ...OUTDOOR, top: "#8fd0f0", bottom: "#e6f6dc", floor: "#5f9a3f", floorTop: "#79b955" },
  build(kit) {
    kit.enclosure(W, 6, true);
    buildCourse(kit);
    // The golf bag, just behind the tee: the club stands in it, head down, grip up where a hand can get it.
    const bagWalls = [
      kit.solid(0, BAG.floor, BAG.hw + 0.02, 0.02, "ground", { collides: "props", hidden: true }),
      kit.solid(-BAG.hw, BAG.floor + BAG.h / 2, 0.015, BAG.h / 2, "ground", { collides: "props", hidden: true }),
      kit.solid(BAG.hw, BAG.floor + BAG.h / 2, 0.015, BAG.h / 2, "ground", { collides: "props", hidden: true }),
    ];
    const bagOffsets = [0, -BAG.hw, BAG.hw];
    let bagX = HOLES[0].tee - 1.3;
    const club = kit.box(bagX, BAG.floor + 0.03 + 0.46, 0.016, 0.46, { kind: "club", density: 9, friction: 0.6, color: "#c9ccd1", angle: Math.PI });
    // Held by the grip, pointing on out along the forearm (like the squeegee); the head's a lump on the far end.
    club.body.userData = { tool: true };
    const head = kit.world.createCollider(RAPIER.ColliderDesc.cuboid(0.055, 0.03).setTranslation(0.035, 0.44).setDensity(40).setFriction(0.5).setCollisionGroups(PROP_GROUPS), club.body);
    const ball = kit.ball(HOLES[0].tee, BALL_R + 0.02, BALL_R, { kind: "golfball", density: 14, friction: 0.5, restitution: 0.45, color: "#ffffff" });
    ball.body.setAngularDamping(0.8);

    let hole = 0;
    let strokes = 0;
    const cards: number[] = [];
    /** Where the ball last came to rest (for a drop after out of bounds). */
    let rest: Vec = { ...ball.body.translation() };
    let restTime = 0;
    let sunk = -1;
    let far = 0;
    let hitCooldown = 0;
    /** Just struck: the boost off the club face is still to come. */
    let struck = 0;

    const toTee = (game: Game, i: number) => {
      hole = i;
      strokes = 0;
      const h = HOLES[i];
      ball.body.setTranslation({ x: h.tee, y: BALL_R + 0.02 }, true);
      ball.body.setLinvel({ x: 0, y: 0 }, true);
      ball.body.setAngvel(0, true);
      rest = { x: h.tee, y: BALL_R };
      carry(game, h.tee - 0.9);
      if (!game.held.has(club.body)) putAway(h.tee - 1.3);
    };

    /** The caddie cart: Stanley (and the club, if he's holding it) moved along to x, on the ground. */
    const carry = (game: Game, x: number) => {
      const st = game.stanley;
      const p = st.rig.pelvis.translation();
      const dx = x - p.x;
      const dy = groundY(x) + 0.935 + 0.03 - p.y;
      const bodies = [...st.rig.bodies];
      if (game.held.has(club.body)) bodies.push(club.body);
      for (const b of bodies) {
        const q = b.translation();
        b.setTranslation({ x: q.x + dx, y: q.y + dy }, true);
        b.setLinvel({ x: 0, y: 0 }, true);
      }
      // A club left lying about goes back in the bag, and the bag comes along too.
      if (!game.held.has(club.body)) putAway(x - 0.45 * Math.sign(HOLES[hole].cup - x || 1));
    };

    /** The bag, set down at x with the club in it. */
    const putAway = (x: number) => {
      bagX = x;
      const y = groundY(x);
      bagWalls.forEach((c, i) => c.setTranslationWrtParent({ x: x + bagOffsets[i], y: y + (i === 0 ? BAG.floor : BAG.floor + BAG.h / 2) }));
      club.body.setTranslation({ x, y: y + BAG.floor + 0.03 + 0.46 }, true);
      club.body.setRotation(Math.PI, true);
      club.body.setLinvel({ x: 0, y: 0 }, true);
      club.body.setAngvel(0, true);
    };

    const nameFor = (n: number, par: number) => {
      if (n === 1) return "HOLE IN ONE!!";
      const d = n - par;
      return d <= -2 ? "EAGLE!" : d === -1 ? "Birdie!" : d === 0 ? "Par." : d === 1 ? "Bogey." : d === 2 ? "Double bogey." : `+${d}. It's a lovely day, though.`;
    };

    /**
     * The 18th (well, the 3rd): lining up the last putt, the caddie arrives. At speed. The brakes, he says
     * later, are more of a suggestion. x: the cart's middle; null till it comes.
     */
    let cart: { x: number; hit: boolean; sunk: boolean } | null = null;
    let now: Game | null = null;
    const CART_SPEED = 12;

    const inst: LevelInstance & { club: Prop; ball: Prop; hole: () => number; strokes: () => number; cart: () => { x: number; hit: boolean; sunk: boolean } | null } = {
      club,
      ball,
      hole: () => hole,
      strokes: () => strokes,
      cart: () => cart,
      update(game, dt): GameEvent[] {
        const ev: GameEvent[] = [];
        now = game;
        const pel = game.stanley.rig.pelvis.translation();
        if (cart) {
          cart.x += CART_SPEED * dt;
          // It doesn't stop for him.
          if (!cart.hit && cart.x + 0.95 > pel.x - 0.25) {
            cart.hit = true;
            const st = game.stanley;
            for (const b of game.held.has(club.body) ? [club.body] : []) st.letGo(b);
            st.balance.knockDown(3);
            for (const body of st.rig.bodies) body.setLinvel({ x: CART_SPEED * 0.6 + (body === st.rig.head ? 2 : 0), y: 7 }, true);
            st.rig.pelvis.setAngvel(-9, true);
            ev.push({ type: "ouch", text: "CADDIE!!", pos: { x: pel.x, y: pel.y + 1.4 } });
            ev.push({ type: "sfx", name: "crack" });
            ev.push({ type: "shake", mag: 26 });
            ev.push({
              type: "disaster",
              title: "Hit and Run",
              text: cart.sunk
                ? "The last hole, holed. Nobody saw it: everyone was looking at the cart. The caddie says the brakes are 'more of a suggestion'. It's a lovely day, though."
                : "One putt from the best round of your life. The caddie says the brakes are 'more of a suggestion', and the ball is still on the lip. It's a lovely day, though.",
            });
          }
          // (It misses the ball, somehow. The ball stays exactly where it was: one putt from the cup.)
          ball.body.setLinvel({ x: 0, y: ball.body.linvel().y }, true);
          return ev;
        }
        const held = game.held.has(club.body);
        // Let go of with its head under the turf (a held club swings through the ground), it would fall out of
        // the world: the caddie fishes it out and puts it back in the bag.
        {
          const c = club.body.translation();
          if (!held && (c.y < groundY(c.x) - 0.12 || c.y < -0.3)) putAway(bagX);
        }
        // A swung club hits the ball; put down, it lies on the grass like anything else.
        const want = held ? CLUB_SWING : PROP_GROUPS;
        for (let i = 0; i < club.body.numColliders(); i++) if (club.body.collider(i).collisionGroups() !== want) club.body.collider(i).setCollisionGroups(want);

        const b = ball.body;
        const p = b.translation();
        const v = b.linvel();
        const speed = Math.hypot(v.x, v.y);
        hitCooldown = Math.max(0, hitCooldown - dt);
        // A stroke: the club head connects.
        if (held && hitCooldown === 0 && touching(game, head, b.collider(0))) {
          hitCooldown = 0.6;
          strokes++;
          struck = 0.1;
          ev.push({ type: "sfx", name: "crack", pos: p });
        }
        // Off the club face (the step after it connects, once the ball's moving): a proper swing carries,
        // and the face's loft lifts it; a tap just rolls, like a putt.
        if (struck > 0) {
          struck -= dt;
          const sp = Math.hypot(v.x, v.y);
          if (sp > 0.3) {
            struck = 0;
            const out = Math.min(24, sp * (sp > 3 ? 1.6 : 1.3));
            const dirX = Math.sign(v.x) || 1;
            const loft = sp > 3 ? Math.max(Math.atan2(v.y, Math.abs(v.x)), 0.42) : Math.min(Math.atan2(v.y, Math.abs(v.x)), 0.05);
            b.setLinvel({ x: dirX * out * Math.cos(loft), y: out * Math.sin(loft) }, true);
          }
        }
        // In the air, a little drag.
        if (p.y > groundY(p.x) + 0.2) {
          const now = b.linvel();
          b.setLinvel({ x: now.x * (1 - 0.12 * dt), y: now.y * (1 - 0.12 * dt) }, true);
        }
        // Rolling: grass slows it, the green a little less, sand a lot.
        const h = HOLES[hole];
        const onGround = p.y < groundY(p.x) + BALL_R + 0.02;
        if (onGround) {
          const sandy = HOLES.some((q) => q.sand && p.x > q.sand[0] && p.x < q.sand[1]);
          const green = p.x > h.green[0] && p.x < h.green[1];
          const k = sandy ? 7 : green ? 0.7 : 1.6;
          const now = b.linvel();
          b.setLinvel({ x: now.x * (1 - k * dt), y: now.y }, true);
        }
        // Resting somewhere: remember it (a drop after out of bounds comes back here).
        if (speed < 0.08 && onGround) {
          restTime += dt;
          if (restTime > 0.4) rest = { x: p.x, y: p.y };
        } else restTime = 0;

        // In the cup.
        if (sunk < 0 && Math.abs(p.x - h.cup) < CUP_HW && p.y < GREEN_H - 0.02) {
          sunk = 0;
          cards[hole] = Math.max(1, strokes);
          ev.push({ type: "score", text: nameFor(cards[hole], h.par), pos: { x: h.cup, y: 1.8 } });
        }
        if (sunk >= 0) {
          sunk += dt;
          if (sunk > 2.2) {
            sunk = -1;
            if (hole + 1 < HOLES.length) toTee(game, hole + 1);
            else {
              const total = cards.reduce((s, n) => s + n, 0);
              const d = total - PAR;
              ev.push({
                type: "surprise",
                id: `round-${game.time.toFixed(0)}`,
                text: `Round: ${total} (par ${PAR}). ${d < 0 ? "The board would like to hear how you did that." : d === 0 ? "Par. The board is satisfied." : "The board says it's 'about the fresh air, really.'"}`,
                pos: { x: h.cup - 2, y: 2.6 },
              });
              cards.length = 0;
              toTee(game, 0);
            }
          }
        }
        // The last hole, the ball on the green and Stanley over it (or it's dropped already): here comes the cart.
        const last = hole === HOLES.length - 1;
        const lining = restTime > 0.6 && p.x > h.green[0] && p.x < h.green[1] && Math.abs(pel.x - p.x) < 3;
        if (last && !cart && (lining || sunk > 1.3)) {
          cart = { x: pel.x - 15, hit: false, sunk: sunk >= 0 };
          ev.push({ type: "score", text: "BEEP BEEEEEP!", pos: { x: pel.x - 4, y: groundY(pel.x) + 2.2 } });
          ev.push({ type: "sfx", name: "alarm" });
        }
        // Out of bounds (off either end, or lost): a drop where it last lay, and a stroke.
        if (p.x < 0.3 || p.x > W - 0.3 || p.y < -1) {
          strokes++;
          b.setTranslation({ x: rest.x, y: rest.y + 0.05 }, true);
          b.setLinvel({ x: 0, y: 0 }, true);
          ev.push({ type: "score", text: "Out of bounds. +1", pos: { x: rest.x, y: 1.6 } });
        }
        // The caddie: if the ball's stopped a long way off, the cart takes Stanley to it.
        const sx = game.stanley.rig.pelvis.translation().x;
        far = sunk < 0 && restTime > 0.5 && Math.abs(p.x - sx) > 7 ? far + dt : 0;
        if (far > 1.2) {
          far = 0;
          carry(game, p.x - 0.9 * Math.sign(h.cup - p.x || 1));
          ev.push({ type: "score", text: "Caddie!", pos: { x: p.x, y: 2.2 } });
        }
        return ev;
      },
      progress: () => {
        const h = HOLES[hole];
        return { done: false, label: `Hole ${h.n} of ${HOLES.length}${h.n === HOLES.length ? " (the last)" : ""} · par ${h.par} · ${strokes} stroke${strokes === 1 ? "" : "s"}` };
      },
      // While the ball's flying, the camera goes with it.
      // Rolling up to the cup (or dropping in), the camera goes to the hole to watch.
      follow: () => {
        // (The cart's coming: back to Stanley.)
        if (cart) return null;
        const h = HOLES[hole];
        const bp = ball.body.translation();
        const bv = ball.body.linvel();
        const toCup = (h.cup - bp.x) * bv.x > 0;
        if (sunk >= 0 || (Math.abs(bp.x - h.cup) < 4 && bp.x > h.green[0] && bp.x < h.green[1] && Math.abs(bv.x) > 0.15 && toCup)) return { x: h.cup, y: GREEN_H + 0.4 };
        return Math.hypot(bv.x, bv.y) > 2 ? bp : null;
      },
      drawBack(r) {
        drawScenery(r);
      },
      drawMid(r, game) {
        drawCourse(r);
        drawFlags(r, game, hole);
        drawBag(r, bagX);
        if (cart) drawCart(r, cart.x, now);
        // The ball's small: a marker bobs over it while it's sitting still.
        const bp = ball.body.translation();
        const bv = ball.body.linvel();
        if (Math.hypot(bv.x, bv.y) < 0.5) {
          const y = bp.y + 0.32 + Math.sin(game.time * 4) * 0.04;
          r.poly([{ x: bp.x - 0.07, y: y + 0.09 }, { x: bp.x + 0.07, y: y + 0.09 }, { x: bp.x, y }], "rgba(255,255,255,0.9)");
        }
      },
    };
    putAway(bagX);
    void toTee;
    return inst;
  },
};

function touching(game: Game, a: Collider, b: Collider): boolean {
  let hit = false;
  game.world.contactPair(a, b, (m) => {
    if (m.numContacts() > 0) hit = true;
  });
  return hit;
}

// ---------------------------------------------------------------- art ---

function drawScenery(r: Renderer) {
  // Distant hills and trees, the clubhouse by the first tee.
  for (let i = 0; i < 22; i++) r.circle({ x: i * 5 - 2, y: -2.4 }, 4, i % 2 ? "#a3d48c" : "#b2dd9c");
  for (let x = 6; x < W; x += 3.3) {
    const h = 1.6 + ((x * 41) % 9) * 0.12;
    r.rect(x - 0.07, 0, x + 0.07, h * 0.55, "#6b4a35");
    r.circle({ x, y: h * 0.8 }, 0.55, "#3f7a45");
    r.circle({ x: x + 0.35, y: h * 0.66 }, 0.42, "#4f8f4a");
  }
  r.rect(-0.5, 0, 1.8, 2.2, "#f4efe6");
  r.poly([{ x: -0.7, y: 2.2 }, { x: 0.65, y: 3.0 }, { x: 2.0, y: 2.2 }], "#b2574a");
  r.rect(0.3, 0, 1.0, 1.3, "#7a5638");
  r.text("CLUBHOUSE", { x: 0.65, y: 1.8 }, 0.13, "#2a2230");
}

function drawCourse(r: Renderer) {
  // Fairway, hills, sand, greens (lighter), tee mats.
  for (const hill of HILLS) r.poly([...hill.map(([x, y]) => ({ x, y })), { x: hill[hill.length - 1][0], y: -0.1 }, { x: hill[0][0], y: -0.1 }], "#6aa846");
  for (const h of HOLES) {
    const [g0, g1] = h.green;
    r.poly([{ x: g0 - 0.6, y: 0 }, { x: g0, y: GREEN_H }, { x: h.cup - CUP_HW, y: GREEN_H }, { x: h.cup - CUP_HW, y: 0 }], "#8fd068");
    r.poly([{ x: h.cup + CUP_HW, y: 0 }, { x: h.cup + CUP_HW, y: GREEN_H }, { x: g1, y: GREEN_H }, { x: g1 + 0.6, y: 0 }], "#8fd068");
    r.rect(h.cup - CUP_HW, 0, h.cup + CUP_HW, GREEN_H - 0.14, "#4f8a35");
    r.rect(h.cup - CUP_HW, GREEN_H - 0.14, h.cup + CUP_HW, GREEN_H, "#2a2230");
    for (let x = g0 + 0.2; x < g1; x += 0.4) r.rect(x, GREEN_H - 0.012, x + 0.2, GREEN_H, "rgba(255,255,255,0.18)");
    if (h.sand) r.roundRect(h.sand[0], -0.02, h.sand[1], 0.04, 0.03, "#ecd9a0");
    r.roundRect(h.tee - 0.5, 0, h.tee + 0.5, 0.03, 0.01, "#4f8a35");
    r.text(`${h.n}`, { x: h.tee - 0.75, y: 0.35 }, 0.18, "#ffffff");
  }
}

function drawFlags(r: Renderer, game: Game, current: number) {
  for (const h of HOLES) {
    const top = GREEN_H + 1.6;
    r.line({ x: h.cup, y: GREEN_H - 0.14 }, { x: h.cup, y: top }, 0.02, "#f4f1e8");
    const wave = Math.sin(game.time * 4 + h.n) * 0.04;
    r.poly([{ x: h.cup, y: top }, { x: h.cup + 0.45, y: top - 0.12 + wave }, { x: h.cup, y: top - 0.25 }], h.n - 1 === current ? "#e85d4f" : "#d9a0a0");
    r.text(`${h.n}`, { x: h.cup + 0.15, y: top - 0.12 }, 0.09, "#fff");
  }
}

function drawBag(r: Renderer, x: number) {
  const y = groundY(x);
  r.roundRect(x - BAG.hw - 0.03, y, x + BAG.hw + 0.03, y + BAG.h, 0.04, "#2f5d8a");
  r.rect(x - BAG.hw - 0.03, y + BAG.h - 0.08, x + BAG.hw + 0.03, y + BAG.h, "#f08a3c");
  r.rect(x - BAG.hw - 0.03, y + 0.12, x + BAG.hw + 0.03, y + 0.16, "#f4f1e8");
  r.text("OJ", { x, y: y + 0.3 }, 0.07, "#fff");
}

/** The caddie's cart: white, a striped roof, the caddie at the wheel (eyes wide), going flat out. */
function drawCart(r: Renderer, x: number, game: Game | null) {
  const y = groundY(x);
  const wob = Math.sin((game?.time ?? 0) * 40) * 0.015;
  for (const dx of [-0.6, 0.6]) {
    r.circle({ x: x + dx, y: groundY(x + dx) + 0.17 }, 0.17, "#1d1d22");
    r.circle({ x: x + dx, y: groundY(x + dx) + 0.17 }, 0.08, "#c9ccd1");
  }
  r.roundRect(x - 0.95, y + 0.25 + wob, x + 0.95, y + 0.62 + wob, 0.08, "#f4f1e8");
  r.rect(x + 0.5, y + 0.6 + wob, x + 0.56, y + 1.55 + wob, "#c9ccd1");
  r.rect(x - 0.85, y + 0.6 + wob, x - 0.79, y + 1.55 + wob, "#c9ccd1");
  r.roundRect(x - 1.0, y + 1.52 + wob, x + 0.65, y + 1.64 + wob, 0.04, "#2f7a4a");
  for (let i = 0; i < 6; i++) r.rect(x - 1.0 + i * 0.275, y + 1.52 + wob, x - 0.86 + i * 0.275, y + 1.64 + wob, "#f4f1e8");
  r.roundRect(x - 0.5, y + 0.6 + wob, x - 0.1, y + 1.0 + wob, 0.05, "#2f7a4a");
  // The caddie, hands on the wheel, mouth an O.
  r.roundRect(x - 0.35, y + 0.62 + wob, x - 0.05, y + 1.05 + wob, 0.08, "#e85d4f");
  drawCoworkerHead(r, x - 0.2, y + 1.22 + wob, "#f2c79b", "#6b4a35", { x: x + 5, y: y + 1.2 }, 2);
  r.line({ x: x + 0.05, y: y + 0.85 + wob }, { x: x + 0.35, y: y + 0.95 + wob }, 0.03, "#2a2230");
  r.circle({ x: x - 0.12, y: y + 1.13 + wob }, 0.03, "#2a2230");
  // Speed lines behind it.
  for (let i = 0; i < 3; i++) r.line({ x: x - 1.2 - i * 0.15, y: y + 0.4 + i * 0.3 }, { x: x - 1.9 - i * 0.2, y: y + 0.4 + i * 0.3 }, 0.025, "rgba(255,255,255,0.7)");
}
