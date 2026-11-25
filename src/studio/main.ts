import { Renderer } from "../render/renderer";
import type { Game } from "../sim/game";
import { drawStanleyHD, type StanleyLook } from "../render/charactersHD";
import { drawCoworkerHandsHD, drawCoworkerHeadHD } from "../render/charactersHD";
import { POSES, posed } from "./pose";

// The character studio: Stanley in a row of fixed poses and the coworkers, big,
// on a plain background, so the details can be looked at properly.

/** The plain renderer, with its Stanley drawing opened up for the comparison. */
class Plain extends Renderer {
  stanley(game: Game) {
    this.drawStanley(game, 0);
  }
  setTime(t: number) {
    this.time = t;
  }
}

const canvas = document.getElementById("studio") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const r = new Plain(canvas, ctx);
const showPlain = document.getElementById("plain") as HTMLInputElement;
const bg = document.getElementById("bg") as HTMLSelectElement;

const CELL = { w: 2.3, h: 2.5 };
const COLS = 4;
/** Each cell's Stanley keeps his swinging bits from frame to frame. */
const looks: StanleyLook[] = [];
Object.assign(window, { studio: { looks } });
let last = 0;
/** Hopping about, to see the lanyard, cap, hair and hem swing and the squash on landing. */
const HOP = { ...POSES[0], name: "Hopping (springs, squash)" };

function frame(now: number) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = canvas.clientWidth;
  const cellPx = W / COLS;
  const scale = cellPx / CELL.w;
  const rows = Math.ceil((POSES.length + 1) / COLS) + 1;
  const H = Math.round(rows * CELL.h * scale);
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.height = `${H}px`;
  }
  r.setTime(now / 1000);
  const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
  last = now;
  const t = now / 1000;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = bg.value;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const cam = r.camera;
  cam.scale = scale;
  cam.w = cellPx;
  cam.h = CELL.h * scale;
  const cell = (i: number, fn: () => void, label: string) => {
    const cx = (i % COLS) * cellPx;
    const cy = Math.floor(i / COLS) * CELL.h * scale;
    ctx.setTransform(dpr, 0, 0, dpr, cx * dpr, cy * dpr);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, cellPx, CELL.h * scale);
    ctx.clip();
    // Floor line.
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    ctx.fillRect(0, cam.toScreen({ x: 0, y: 0 }).y, cellPx, 2);
    fn();
    ctx.restore();
    ctx.fillStyle = "rgba(42,34,48,0.7)";
    ctx.font = "600 13px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(label, 10, 20);
  };
  [...POSES, HOP].forEach((pose, i) => {
    cell(
      i,
      () => {
        cam.x = 0.15;
        cam.y = CELL.h / 2 - 0.22;
        // The hopping one bounces along a path (a hop every 0.8 s, swaying side to side).
        const ph = (t % 0.8) / 0.8;
        const at = pose === HOP ? { x: Math.sin(t * 1.3) * 0.25, y: ph < 0.62 ? Math.sin((ph / 0.62) * Math.PI) * 0.45 : 0 } : { x: 0, y: 0 };
        const g = posed(pose === HOP ? { ...pose, grounded: at.y < 0.02 } : pose, at);
        (g.stanley.balance as { groundDist: number }).groundDist = 0.935 + at.y;
        looks[i] ??= { blink: 0 };
        drawStanleyHD(r, g, looks[i], dt);
        if (showPlain.checked) {
          // The plain one, small, in the corner for comparison.
          const s = cam.scale;
          cam.scale = s * 0.32;
          cam.x = 2.7;
          cam.y = CELL.h * 1.5;
          r.stanley(posed(pose, { x: 0, y: 0 }));
          cam.scale = s;
        }
      },
      pose.name,
    );
  });
  // The coworkers, over a cubicle wall.
  const row = POSES.length + 1;
  for (let k = 0; k < 2; k++) {
    cell(
      row + k,
      () => {
        const s0 = cam.scale;
        cam.scale = s0 * 2.4;
        cam.x = 0;
        cam.y = 1.25;
        const wall = 1.2;
        const skin = k ? "#8a5a3c" : "#f2c79b";
        const hair = k ? "#2a2230" : "#c58be8";
        drawCoworkerHeadHD(r, 0, wall - 0.2 + 0.32, skin, hair, { x: Math.sin(now / 900) * 2, y: 0.8 }, k);
        r.rect(-1.0, 0, 1.0, wall, "#969ea8");
        r.rect(-1.0, wall - 0.05, 1.0, wall, "#7a828c");
        drawCoworkerHandsHD(r, 0, wall, skin);
        cam.scale = s0;
      },
      k ? "Coworker 2" : "Coworker 1",
    );
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
