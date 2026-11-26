import { HARBOUR, type Level, type LevelInstance } from "../level";
import type { Prop } from "../kit";
import type { Game, GameEvent } from "../../sim/game";
import type { Renderer } from "../../render/renderer";
import { RAPIER } from "../../physics/world";
import { PROP_GROUPS } from "../../physics/groups";
import type { Vec } from "../../sim/math";

// CEO Life: the yacht. Take the rod, wait for a bite, and fight whatever it
// is: pump the rod back (it pulls the fish in) and lower it (the slack's
// reeled in). When it runs, the reel gives line; yank against a run and the
// line snaps. Bring it in to the stern and it's landed. Don't go over the back.

const W = 28;
const H = 7;
/** The deck: its top, and where the stern (the back, open to the sea) is. */
export const DECK = { top: 1.5, stern: 8 };
export const SEA = 0.75;
const HOLDER = { x: 7.2, hw: 0.05, h: 0.45 };
const ROD_HH = 0.8;
/** How hard the line pulls when it's stretched (N per metre over its length), the reel's drag, and the breaking strain. */
const LINE_K = 900;
const DRAG = 320;
export const SNAP = 820;
/** Line out at the start of a fight, and close enough to land it. */
/** Reeling speed (m/s), and how much of the line's pull reaches Stanley. */
const REEL = 1.1;
const HAUL = 0.4;
const LAND_AT = DECK.stern + 1.2;

interface Catch {
  name: string;
  /** Half size, weight, and how hard it pulls when it runs (N). */
  hw: number;
  hh: number;
  mass: number;
  pull: number;
  color: string;
  says: string;
}
export const CATCHES: Catch[] = [
  { name: "Marlin", hw: 0.7, hh: 0.14, mass: 34, pull: 520, color: "#3b6ea8", says: "A blue marlin! The board will want a photo." },
  { name: "Tuna", hw: 0.42, hh: 0.14, mass: 22, pull: 360, color: "#6a7f9a", says: "A tuna. Sushi for the shareholders." },
  { name: "Old boot", hw: 0.14, hh: 0.1, mass: 3, pull: 0, color: "#5b4330", says: "An old boot. Size 9. Your size, actually." },
  { name: "Briefcase", hw: 0.2, hh: 0.14, mass: 6, pull: 0, color: "#3a2a22", says: "A briefcase. Full of shares. In a competitor." },
  { name: "Golf ball", hw: 0.05, hh: 0.05, mass: 1, pull: 0, color: "#ffffff", says: "A golf ball, monogrammed \"G.T.\" How does he keep losing these?" },
];
const ODDS = [0.42, 0.28, 0.1, 0.1, 0.1];

type State = "waiting" | "fight" | "landed" | "gone";

export const yacht: Level = {
  id: "ceo-yacht",
  title: "Yacht",
  goal: "The company yacht. Take the rod and catch something. Ideally a marlin.",
  hint: "Hold grab on the rod to take it · When a fish is on: pull the rod back, then lower it (the slack reels in) · Don't yank when it runs",
  icon: "🛥️",
  par: [0, 0],
  sandbox: true,
  ceo: true,
  bounds: { w: W, h: H },
  viewHeight: 6,
  spawn: { x: 5.2, y: DECK.top },
  theme: { ...HARBOUR, top: "#f2a27a", bottom: "#fde2bf", floor: "#2f5d8a", floorTop: "#3b6ea8" },
  build(kit) {
    kit.enclosure(W, H, true);
    kit.solid(DECK.stern / 2, DECK.top / 2, DECK.stern / 2, DECK.top / 2, "dock", { hidden: true });
    kit.water(DECK.stern + 0.05, W, SEA);
    // The rod stands in a holder at the stern.
    kit.solid(HOLDER.x, DECK.top + 0.01, HOLDER.hw + 0.02, 0.01, "ground", { collides: "props", hidden: true });
    for (const s of [-1, 1]) kit.solid(HOLDER.x + s * HOLDER.hw, DECK.top + HOLDER.h / 2, 0.012, HOLDER.h / 2, "ground", { collides: "props", hidden: true });
    const rod = kit.box(HOLDER.x, DECK.top + 0.03 + ROD_HH, 0.02, ROD_HH, { kind: "rod", density: 8, friction: 0.7, color: "#2a2230" });
    rod.body.userData = { tool: true };

    let state: State = "waiting";
    let t = 0;
    /** Seconds until a bite (while the rod's in hand). */
    let biteIn = 3;
    let lure: Vec = { x: DECK.stern + 6, y: SEA };
    let fish: Prop | null = null;
    let kind: Catch = CATCHES[0];
    let line = 6;
    let tension = 0;
    let running = 0;
    let rest = 1;
    /** The fish tires: each run's a little weaker than the last. */
    let stamina = 1;
    let strain = 0;
    let caught = 0;
    let best = "";
    let rodDown = 0;
    let now: Game | null = null;

    const tip = (): Vec => {
      const p = rod.body.translation();
      const a = rod.body.rotation();
      return { x: p.x - Math.sin(a) * rod.hh, y: p.y + Math.cos(a) * rod.hh };
    };

    const hook = (game: Game) => {
      const r = game.rand();
      let acc = 0;
      kind = CATCHES[CATCHES.length - 1];
      for (let i = 0; i < CATCHES.length; i++) {
        acc += ODDS[i];
        if (r < acc) {
          kind = CATCHES[i];
          break;
        }
      }
      const body = game.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(lure.x, SEA - 0.05).setCcdEnabled(true).setAngularDamping(2));
      game.world.createCollider(
        RAPIER.ColliderDesc.cuboid(kind.hw, kind.hh).setMass(kind.mass).setFriction(0.3).setCollisionGroups(PROP_GROUPS),
        body,
      );
      fish = { kind: "catch", body, hw: kind.hw, hh: kind.hh, color: kind.color, tag: kind.name };
      game.props.push(fish);
      const tp = tip();
      line = Math.hypot(lure.x - tp.x, lure.y - tp.y);
      state = "fight";
      running = kind.pull ? 1.2 : 0;
      rest = 0;
      stamina = 1;
      strain = 0;
    };

    const lose = (game: Game) => {
      if (fish) game.removeProp(fish);
      fish = null;
      state = "gone";
      t = 0;
    };

    const inst: LevelInstance & { rod: Prop; state: () => State; fish: () => Prop | null; tension: () => number; caught: () => number; line: () => number } = {
      rod,
      state: () => state,
      fish: () => fish,
      tension: () => tension,
      caught: () => caught,
      line: () => line,
      update(game, dt): GameEvent[] {
        now = game;
        const ev: GameEvent[] = [];
        t += dt;
        const held = game.held.has(rod.body);
        const tp = tip();

        if (state === "waiting") {
          // The float bobs; with the rod in hand, sooner or later, something bites.
          lure = { x: DECK.stern + 6 + Math.sin(t * 0.3) * 0.6, y: SEA + Math.sin(t * 2.1) * 0.03 };
          if (held) biteIn -= dt;
          if (biteIn <= 0) {
            hook(game);
            ev.push({ type: "score", text: "FISH ON!", pos: { x: lure.x, y: SEA + 1.4 } });
            ev.push({ type: "sfx", name: "winch" });
          }
        } else if (state === "fight" && fish) {
          const b = fish.body;
          const p = b.translation();
          const dx = p.x - tp.x;
          const dy = p.y - tp.y;
          const dist = Math.hypot(dx, dy) || 1e-6;
          // The reel takes up any slack, and (rod in hand, the fish not running) winds in steadily.
          line = Math.min(line, dist + 0.02);
          if (held && running <= 0) line = Math.max(0.5, line - REEL * dt);
          // Stretched, the line pulls the fish towards the rod's tip, and the rod (and Stanley) towards the fish.
          tension = Math.max(0, (dist - line) * LINE_K);
          // When it's pulling harder than the drag, the reel gives line (a run).
          if (tension > DRAG) line += Math.min(4, (tension - DRAG) / LINE_K / dt) * dt;
          if (tension > 0) {
            const ux = dx / dist;
            const uy = dy / dist;
            const j = Math.min(tension, SNAP) * dt;
            b.applyImpulse({ x: -ux * j, y: -uy * j }, true);
            if (held) rod.body.applyImpulseAtPoint({ x: ux * j * HAUL, y: uy * j * HAUL }, tp, true);
          }
          // Too much strain for too long (yanking against a run) and it parts.
          strain = tension > SNAP * 0.7 ? strain + dt : Math.max(0, strain - dt * 0.5);
          if (strain > 0.5) {
            ev.push({ type: "ouch", text: "SNAP!", pos: { x: tp.x, y: tp.y + 0.6 } });
            lose(game);
          } else {
            // The fish: runs away from the boat now and then, rests in between. It swims along the surface.
            if (running > 0) {
              running -= dt;
              stamina = Math.max(0.35, stamina - 0.035 * dt);
              if (running <= 0) rest = 1.5 + game.rand() * 2;
              b.applyImpulse({ x: kind.pull * stamina * dt, y: (SEA - 0.05 - p.y) * kind.mass * 8 * dt }, true);
            } else if (kind.pull) {
              rest -= dt;
              if (rest <= 0) running = 1 + game.rand() * 2;
              b.applyImpulse({ x: kind.pull * 0.12 * dt, y: 0 }, true);
            }
            // Brought in to the stern: landed (it flops aboard).
            if (p.x < LAND_AT && p.y > SEA - 0.4) {
              state = "landed";
              t = 0;
              caught++;
              if (!best || CATCHES.findIndex((c) => c.name === kind.name) < CATCHES.findIndex((c) => c.name === best)) best = kind.name;
              b.setTranslation({ x: DECK.stern - 2.6, y: DECK.top + 0.6 }, true);
              b.setLinvel({ x: -1, y: 2 }, true);
              b.setAngvel(3, true);
              ev.push({ type: "score", text: `LANDED! ${kind.name}!`, pos: { x: DECK.stern - 2.5, y: DECK.top + 2 } });
              ev.push({ type: "surprise", id: `catch-${caught}`, text: kind.says, pos: { x: DECK.stern - 2.6, y: DECK.top + 1.4 } });
            }
            // Let go of the rod (or dropped it), and it's off.
            if (!held) {
              ev.push({ type: "score", text: "It got away.", pos: { x: p.x, y: SEA + 1.2 } });
              lose(game);
            }
          }
        } else if (state === "landed") {
          tension = 0;
          if (t > 5) {
            if (fish) game.removeProp(fish);
            fish = null;
            state = "waiting";
            biteIn = 3 + game.rand() * 5;
          }
        } else if (state === "gone") {
          tension = 0;
          if (t > 2) {
            state = "waiting";
            biteIn = 3 + game.rand() * 5;
          }
        }
        // Into the sea himself (the game fishes him out): whatever was on gets away.
        if (game.stanley.rig.pelvis.translation().x > DECK.stern + 0.3 && game.stanley.rig.pelvis.translation().y < DECK.top && state === "fight") {
          ev.push({ type: "score", text: "Man overboard! It got away.", pos: { x: DECK.stern + 1, y: 2.4 } });
          lose(game);
        }
        // The rod, left lying about (or in the sea): the deckhand puts it back in its holder.
        const rp = rod.body.translation();
        rodDown = !held && (Math.abs(rp.x - HOLDER.x) > 0.2 || rp.y < DECK.top + 0.5) ? rodDown + dt : 0;
        if (rodDown > 2.5) {
          rodDown = 0;
          rod.body.setTranslation({ x: HOLDER.x, y: DECK.top + 0.03 + ROD_HH }, true);
          rod.body.setRotation(0, true);
          rod.body.setLinvel({ x: 0, y: 0 }, true);
          rod.body.setAngvel(0, true);
        }
        return ev;
      },
      progress: (game) => {
        const tally = caught ? ` · ${caught} caught${best ? `, best: ${best}` : ""}` : "";
        if (state === "fight") {
          const bars = Math.round(Math.min(1, tension / SNAP) * 5);
          return { done: false, label: `FISH ON! Line ${line.toFixed(0)} m · strain ${"▮".repeat(bars)}${"▯".repeat(5 - bars)}${tally}` };
        }
        if (!game.held.has(rod.body)) return { done: false, label: `Take the rod from its holder${tally}` };
        return { done: false, label: `Waiting for a bite…${tally}` };
      },
      // While fighting, the camera keeps both Stanley and the fish in view.
      follow: (game) => {
        if (state !== "fight" || !fish) return null;
        const p = fish.body.translation();
        const s = game.stanley.position;
        return { x: (p.x + s.x) / 2, y: s.y };
      },
      drawBack(r) {
        drawSea(r);
        drawYacht(r);
      },
      drawMid(r) {
        // The line: from the rod's tip, sagging when slack, taut when it's pulling.
        const tp = tip();
        const end = state === "fight" && fish ? fish.body.translation() : lure;
        const slack = state === "fight" ? Math.max(0, line - Math.hypot(end.x - tp.x, end.y - tp.y)) : 1.2;
        const mid = { x: (tp.x + end.x) / 2, y: (tp.y + end.y) / 2 - Math.min(1.5, slack * 0.8 + 0.1) };
        const ctx = r.ctx;
        const a = r.camera.toScreen(tp);
        const m = r.camera.toScreen(mid);
        const e = r.camera.toScreen(end);
        ctx.strokeStyle = tension > SNAP * 0.75 ? "#e85d4f" : "rgba(250,250,250,0.85)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(m.x, m.y, e.x, e.y);
        ctx.stroke();
        if (state === "waiting" || state === "gone") {
          r.circle(lure, 0.05, "#e85d4f");
          r.circle({ x: lure.x, y: lure.y + 0.04 }, 0.035, "#ffffff");
        }
        if (fish) drawCatch(r, fish, kind, now);
      },
    };
    return inst;
  },
};

// ---------------------------------------------------------------- art ---

function drawSea(r: Renderer) {
  const time = r.clock;
  // The sun going down, a far island, the sea all the way across.
  r.circle({ x: 20, y: 3.1 }, 0.9, "rgba(255,235,170,0.95)");
  r.poly([{ x: 14, y: SEA + 0.2 }, { x: 16.5, y: SEA + 1.1 }, { x: 18, y: SEA + 0.9 }, { x: 21, y: SEA + 0.2 }], "#7a6a8a");
  r.rect(-10, -1, W + 10, SEA + 0.15, "#2f6d98");
  r.rect(-10, SEA, W + 10, SEA + 0.15, "#4a8fbd");
  for (let i = 0; i < 26; i++) {
    const x = ((i * 3.7 + time * 0.4) % (W + 6)) - 3;
    const y = SEA - 0.1 - (i % 4) * 0.15;
    r.line({ x, y }, { x: x + 0.6, y }, 0.025, "rgba(255,255,255,0.35)");
  }
  r.rect(19, SEA - 0.05, 21, SEA + 0.1, "rgba(255,220,150,0.35)");
}

function drawYacht(r: Renderer) {
  // A white hull with a blue stripe, the teak deck, the cabin and its windows, a rail, the fighting chair.
  r.poly([{ x: -1, y: 0.2 }, { x: DECK.stern, y: 0.25 }, { x: DECK.stern, y: DECK.top }, { x: -1, y: DECK.top }], "#f4f1e8");
  r.rect(-1, 0.55, DECK.stern, 0.7, "#2f5d8a");
  r.rect(-1, DECK.top - 0.08, DECK.stern, DECK.top, "#b98a5a");
  for (let x = -1; x < DECK.stern; x += 0.25) r.rect(x, DECK.top - 0.08, x + 0.01, DECK.top, "rgba(0,0,0,0.15)");
  r.roundRect(-1, DECK.top, 3.2, DECK.top + 1.6, 0.25, "#f4f1e8");
  for (const x of [0.0, 1.0, 2.0]) r.roundRect(x, DECK.top + 0.8, x + 0.7, DECK.top + 1.3, 0.12, "#2a3a55");
  r.rect(-1, DECK.top + 1.6, 3.2, DECK.top + 1.7, "#2f5d8a");
  r.line({ x: 3.4, y: DECK.top + 0.9 }, { x: DECK.stern - 0.6, y: DECK.top + 0.9 }, 0.03, "#c9ccd1");
  for (let x = 3.4; x < DECK.stern - 0.5; x += 1.0) r.line({ x, y: DECK.top }, { x, y: DECK.top + 0.9 }, 0.025, "#c9ccd1");
  // The fighting chair, and the rod holder.
  r.rect(4.0, DECK.top, 4.1, DECK.top + 0.45, "#8a9099");
  r.roundRect(3.75, DECK.top + 0.4, 4.35, DECK.top + 0.55, 0.05, "#f4f1e8");
  r.roundRect(3.75, DECK.top + 0.5, 3.9, DECK.top + 1.1, 0.05, "#f4f1e8");
  r.roundRect(HOLDER.x - HOLDER.hw - 0.02, DECK.top, HOLDER.x + HOLDER.hw + 0.02, DECK.top + HOLDER.h, 0.02, "#c9ccd1");
  r.text("CEO", { x: 1.1, y: 0.95 }, 0.22, "#2f5d8a");
}

function drawCatch(r: Renderer, fish: Prop, kind: Catch, game: Game | null) {
  const b = fish.body;
  const p = b.translation();
  const a = b.rotation();
  const ctx = r.ctx;
  const s = r.camera.toScreen(p);
  const sc = r.camera.scale;
  const w = fish.hw * sc;
  const h = fish.hh * sc;
  const wag = Math.sin((game?.time ?? 0) * 9) * 0.25;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(-a);
  // Facing away from the boat (it swims away).
  if (kind.name === "Marlin" || kind.name === "Tuna") {
    ctx.fillStyle = kind.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#dce6f0";
    ctx.beginPath();
    ctx.ellipse(0, h * 0.35, w * 0.9, h * 0.55, 0, 0, Math.PI);
    ctx.fill();
    // Tail (wagging), and for the marlin a sail and a bill.
    ctx.fillStyle = kind.color;
    ctx.beginPath();
    ctx.moveTo(-w * 0.9, 0);
    ctx.lineTo(-w * 1.35, -h * (1.3 + wag));
    ctx.lineTo(-w * 1.2, 0);
    ctx.lineTo(-w * 1.35, h * (1.3 - wag));
    ctx.closePath();
    ctx.fill();
    if (kind.name === "Marlin") {
      ctx.beginPath();
      ctx.moveTo(-w * 0.5, -h * 0.8);
      ctx.quadraticCurveTo(-w * 0.1, -h * 3.2, w * 0.45, -h * 0.8);
      ctx.fill();
      ctx.strokeStyle = kind.color;
      ctx.lineWidth = Math.max(2, sc * 0.03);
      ctx.beginPath();
      ctx.moveTo(w * 0.95, -h * 0.1);
      ctx.lineTo(w * 1.7, -h * 0.3);
      ctx.stroke();
    }
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(w * 0.72, -h * 0.25, Math.max(1.5, h * 0.18), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a1a22";
    ctx.beginPath();
    ctx.arc(w * 0.75, -h * 0.25, Math.max(1, h * 0.09), 0, Math.PI * 2);
    ctx.fill();
  } else if (kind.name === "Old boot") {
    ctx.fillStyle = kind.color;
    ctx.fillRect(-w, -h, w * 0.8, h * 2);
    ctx.fillRect(-w, 0, w * 2, h);
    ctx.fillStyle = "#2a1d15";
    ctx.fillRect(-w, h * 0.7, w * 2, h * 0.3);
  } else if (kind.name === "Briefcase") {
    ctx.fillStyle = kind.color;
    ctx.fillRect(-w, -h, w * 2, h * 2);
    ctx.strokeStyle = "#c9962a";
    ctx.lineWidth = 2;
    ctx.strokeRect(-w * 0.3, -h * 1.4, w * 0.6, h * 0.4);
    ctx.fillStyle = "#c9962a";
    ctx.fillRect(-w * 0.1, -h * 0.2, w * 0.2, h * 0.3);
  } else {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(0, 0, w, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(42,34,48,0.6)";
    ctx.stroke();
  }
  ctx.restore();
}
