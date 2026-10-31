import { OFFICE, type Level } from "../level";
import { toward } from "../../sim/math";
import { Curio } from "../curio";

const COUNTER = { x0: 0.2, x1: 1.8, top: 0.95 };
const DESK = { x0: 11.4, x1: 13.4, top: 0.78 };
const NEEDED = 3;
/** The cubicle walls the coworkers peek over. */
const CUBICLES = [6.2, 8.6];
const WALL_TOP = 1.2;
/** What they say when they peek over. */
export const PEEK_LINES = [
  "Is that really the way you should be doing that?",
  "I would probably try carrying that a different way.",
  "Have you considered… walking normally?",
  "That's not how I'd hold a tray.",
  "Bold technique.",
  "Should I call someone?",
  "Are you okay? Asking for the coffee.",
  "We did a training module on this.",
  "I'm going to pretend I didn't see that.",
  "Is one of those mine? …Was one of those mine?",
  "You're doing great. Probably.",
  "Mind the— okay.",
];
const PEEK_UP = 2.8;
const PEEK_MOVE = 0.35;

/** Downtown job 4: carry a tray of coffees across the office without spilling. */
export const coffeeRun: Level = {
  id: "coffee-run",
  title: "Coffee Run",
  goal: `Carry ${NEEDED} coffees on the tray to Reception (the desk on the far right). Don't spill.`,
  icon: "☕",
  par: [25, 55],
  bounds: { w: 14, h: 4.6 },
  spawn: { x: 2.7, y: 0 },
  target: { x: (DESK.x0 + DESK.x1) / 2, y: DESK.top + 0.4 },
  theme: OFFICE,
  build(kit) {
    kit.enclosure(14, 4.6);
    kit.solid((COUNTER.x0 + COUNTER.x1) / 2, COUNTER.top / 2, (COUNTER.x1 - COUNTER.x0) / 2, COUNTER.top / 2, "counter");
    kit.solid((DESK.x0 + DESK.x1) / 2, DESK.top / 2, (DESK.x1 - DESK.x0) / 2, DESK.top / 2, "desk");
    const trayY = COUNTER.top + 0.025;
    // The tray sits at the front of the counter, within reach.
    const trayX = COUNTER.x1 - 0.36;
    const tray = kit.tray(trayX, trayY, 0.34);
    for (const dx of [-0.225, -0.075, 0.075, 0.225]) kit.fragile(trayX + dx, trayY + 0.025, "cup");
    kit.fragile(7.0, 0, "lamp");
    // Coworkers, hidden behind their cubicle walls, popping up now and then to comment.
    const peekers = CUBICLES.map((x0, i) => ({
      x: x0 + 0.7,
      skin: i ? "#8a5a3c" : "#f2c79b",
      hair: i ? "#2a2230" : "#c58be8",
      wait: 2 + i * 3,
      phase: "hidden" as "hidden" | "rising" | "up" | "sinking",
      t: 0,
      line: "",
    }));
    const deck: string[] = [];
    const nextLine = (rand: () => number) => {
      if (!deck.length) {
        deck.push(...PEEK_LINES);
        for (let i = deck.length - 1; i > 0; i--) {
          const j = Math.floor(rand() * (i + 1));
          [deck[i], deck[j]] = [deck[j], deck[i]];
        }
      }
      return deck.pop()!;
    };
    /** How far up a peeker is, 0 (hidden) to 1 (eyes over the wall). */
    const lift = (p: (typeof peekers)[number]) =>
      p.phase === "hidden" ? 0 : p.phase === "up" ? 1 : p.phase === "rising" ? Math.min(1, p.t / PEEK_MOVE) : Math.max(0, 1 - p.t / PEEK_MOVE);
    const copier = new Curio("copier", "The photocopier has made a copy of your face. Forty copies, actually.", { x0: 4.3, y0: 0, x1: 5.3, y1: 1.1 });

    return {
      update: (game, dt) => {
        for (const p of peekers) {
          p.t += dt;
          const someoneElseUp = peekers.some((q) => q !== p && q.phase !== "hidden");
          if (p.phase === "hidden" && p.t > p.wait && !someoneElseUp) {
            p.phase = "rising";
            p.t = 0;
            p.line = nextLine(game.rand);
          } else if (p.phase === "rising" && p.t > PEEK_MOVE) {
            p.phase = "up";
            p.t = 0;
          } else if (p.phase === "up" && p.t > PEEK_UP) {
            p.phase = "sinking";
            p.t = 0;
          } else if (p.phase === "sinking" && p.t > PEEK_MOVE) {
            p.phase = "hidden";
            p.t = 0;
            p.wait = 3 + game.rand() * 4;
          }
        }
        return copier.update(game, dt);
      },
      // Reception's desk is a safe place for a coffee: set one down there (from
      // the tray or by hand) and it stays in one piece. Anywhere else, it's fair game.
      safe: (p) => {
        if (p.kind !== "cup") return false;
        const q = p.body.translation();
        return q.x > DESK.x0 - 0.1 && q.x < DESK.x1 + 0.1 && q.y > DESK.top - 0.05 && q.y < DESK.top + 0.7;
      },
      progress: (game) => {
        const left = game.props.filter((p) => p.kind === "cup");
        const trayDown = !game.held.has(tray.body);
        const served = left.filter((c) => {
          const q = c.body.translation();
          const v = c.body.linvel();
          // On the desk, or on the tray resting on the desk's edge.
          return trayDown && q.x > DESK.x0 - 0.4 && q.x < DESK.x1 && q.y > DESK.top && q.y < DESK.top + 0.4 && Math.hypot(v.x, v.y) < 0.15;
        }).length;
        if (left.length < NEEDED) return { done: false, label: "Out of coffee. Restart ↺" };
        return { done: served >= NEEDED, label: `${Math.min(served, NEEDED)}/${NEEDED} delivered · ${left.length} left` };
      },
      drawBack(r, game) {
        // Kitchenette, the photocopier, cubicle walls, the boss's assistant's desk.
        r.rect(COUNTER.x0, COUNTER.top + 0.6, COUNTER.x1, COUNTER.top + 1.4, "#c9ccd1");
        r.rect(COUNTER.x0 + 0.1, COUNTER.top + 0.7, COUNTER.x0 + 0.7, COUNTER.top + 1.3, "#e8eaed");
        r.text("KITCHEN", { x: (COUNTER.x0 + COUNTER.x1) / 2, y: COUNTER.top + 1.7 }, 0.14, "#5f6670");
        r.roundRect(4.3, 0, 5.3, 1.0, 0.05, "#e8eaed");
        r.rect(4.35, 1.0, 5.25, 1.08, "#9aa0a8");
        r.rect(4.5, 0.65, 4.9, 0.72, "#5d9de8");
        r.text("COPY", { x: 4.8, y: 0.35 }, 0.1, "#5f6670");
        // Coworkers peek up over their cubicle walls to watch the coffee go by:
        // just the top of a head and a pair of eyes, and fingers on the edge.
        const head = game.stanley.rig.head.translation();
        for (const p of peekers) {
          const k = lift(p);
          if (k <= 0) continue;
          const face = { x: p.x, y: WALL_TOP - 0.2 + k * 0.32 };
          r.circle({ x: p.x, y: face.y + 0.05 }, 0.17, p.hair);
          r.circle({ x: p.x, y: face.y - 0.02 }, 0.155, p.skin);
          for (const dx of [-0.06, 0.06]) {
            const e = { x: p.x + dx, y: face.y };
            r.circle(e, 0.035, "#fff");
            r.circle(toward(e, head, 0.015), 0.016, "#2a2230");
          }
        }
        for (const x of CUBICLES) {
          r.rect(x, 0, x + 1.4, WALL_TOP, "#969ea8");
          r.rect(x, WALL_TOP - 0.05, x + 1.4, WALL_TOP, "#7a828c");
        }
        for (const p of peekers) {
          const k = lift(p);
          if (k < 0.6) continue;
          for (const dx of [-0.2, 0.2]) r.circle({ x: p.x + dx, y: WALL_TOP + 0.01 }, 0.05, p.skin);
        }
        r.rect(DESK.x0 + 0.3, DESK.top + 0.05, DESK.x0 + 0.9, DESK.top + 0.5, "#2a2230");
        r.rect(DESK.x0 + 0.33, DESK.top + 0.08, DESK.x0 + 0.87, DESK.top + 0.47, "#5d9de8");
        r.text("RECEPTION", { x: (DESK.x0 + DESK.x1) / 2, y: 2.4 }, 0.26, "#5f6670");
        r.text("coffee drop-off", { x: (DESK.x0 + DESK.x1) / 2, y: 2.1 }, 0.14, "#8a7a6a");
      },
      drawFront(r) {
        // Whoever's peeking says their piece.
        for (const p of peekers) {
          if (p.phase !== "up") continue;
          const lines = wrapWords(p.line, 22);
          const size = 0.17;
          const w = Math.max(...lines.map((l) => l.length)) * size * 0.55 + 0.26;
          const h = lines.length * size * 1.3 + 0.16;
          const bx = p.x;
          const by = WALL_TOP + 0.55;
          r.poly([{ x: bx - 0.08, y: by }, { x: bx + 0.08, y: by }, { x: bx, y: by - 0.14 }], "#ffffff");
          r.roundRect(bx - w / 2, by, bx + w / 2, by + h, 0.08, "#ffffff");
          lines.forEach((l, i) => r.text(l, { x: bx, y: by + h - 0.08 - size * 0.65 - i * size * 1.3 }, size, "#2a2230", "center", 700));
        }
      },
    };
  },
};

/** Split text into lines of at most about `width` characters. */
function wrapWords(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && (line + " " + word).length > width) {
      lines.push(line);
      line = word;
    } else line = line ? line + " " + word : word;
  }
  if (line) lines.push(line);
  return lines;
}
