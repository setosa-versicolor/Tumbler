import type { Renderer } from "../render/renderer";
import type { Vec } from "../sim/math";

// Motion smears: a fast thing leaves a tapered, fading streak behind it along
// its path, like the smear frames in hand-drawn animation. Drawn only.

/** Below this speed (m/s), nothing smears. */
const MIN_SPEED = 3.2;

/**
 * A streak trailing behind something at `at` moving with velocity `v`: as wide
 * as `width` where the thing is, tapering to nothing behind it.
 */
export function smear(r: Renderer, at: Vec, v: Vec, width: number, color: string, strength = 1) {
  const speed = Math.hypot(v.x, v.y);
  if (speed < MIN_SPEED) return;
  const k = Math.min(1, (speed - MIN_SPEED) / 2.5) * strength;
  // About 40 ms of travel, up to 0.7 m.
  const len = Math.min(0.7, speed * 0.04);
  const dx = -v.x / speed;
  const dy = -v.y / speed;
  const tail = { x: at.x + dx * len, y: at.y + dy * len };
  const n = { x: -dy * width * 0.5, y: dx * width * 0.5 };
  const cam = r.camera;
  const a = cam.toScreen({ x: at.x + n.x, y: at.y + n.y });
  const b = cam.toScreen({ x: at.x - n.x, y: at.y - n.y });
  const c = cam.toScreen(tail);
  const h = cam.toScreen(at);
  const t = cam.toScreen(tail);
  const ctx = r.ctx;
  const g = ctx.createLinearGradient(h.x, h.y, t.x, t.y);
  g.addColorStop(0, withAlpha(color, 0.7 * k));
  g.addColorStop(0.35, withAlpha(color, 0.35 * k));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  // Rounded at the front, a long point at the back.
  ctx.quadraticCurveTo(c.x + (a.x - h.x) * 0.3, c.y + (a.y - h.y) * 0.3, c.x, c.y);
  ctx.quadraticCurveTo(c.x + (b.x - h.x) * 0.3, c.y + (b.y - h.y) * 0.3, b.x, b.y);
  ctx.closePath();
  ctx.fill();
}

function withAlpha(c: string, a: number): string {
  if (c.startsWith("#") && c.length === 7) {
    const n = parseInt(c.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  return c;
}
