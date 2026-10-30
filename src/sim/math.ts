export interface Vec {
  x: number;
  y: number;
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Wrap an angle to (-π, π]. */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a - Math.PI;
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Rotate a local-space offset by angle `a`. */
export function rotate(v: Vec, a: number): Vec {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

/**
 * Limb segments hang along their local -Y axis, so a body angle of 0 points
 * straight down. Convert a world direction to that body angle.
 */
export const limbAngleFor = (dx: number, dy: number) => Math.atan2(dx, -dy);

/** Small deterministic PRNG (mulberry32) — the sim never uses Math.random. */
export function rng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** A step of `len` from `from` toward `to` (for eyes that follow things). */
export function toward(from: Vec, to: Vec, len: number): Vec {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.hypot(dx, dy) || 1;
  return { x: from.x + (dx / d) * len, y: from.y + (dy / d) * len };
}
