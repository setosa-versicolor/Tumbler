import type { RigidBody } from "@dimforge/rapier2d-deterministic-compat";
import type { Prop } from "./kit";

/**
 * Height of the tallest pile (two or more) of resting boxes standing on the
 * floor. A box counts only once it has settled and nobody is holding it, and
 * only if it's part of a chain of touching boxes down to the floor.
 */
export function measureStack(props: Prop[], held: Set<RigidBody | null>, floorY = 0, exclude?: (p: Prop) => boolean): number {
  const boxes = props.filter((p) => {
    if ((p.kind !== "box" && p.kind !== "crate") || held.has(p.body) || exclude?.(p)) return false;
    const v = p.body.linvel();
    return Math.hypot(v.x, v.y) < 0.12;
  });
  const extent = (p: Prop) => {
    const a = p.body.rotation();
    const c = Math.abs(Math.cos(a));
    const s = Math.abs(Math.sin(a));
    return { hx: p.hw * c + p.hh * s, hy: p.hw * s + p.hh * c };
  };
  const supported = new Set<Prop>();
  let best = 0;
  // Grow piles upward from the floor.
  for (let changed = true; changed; ) {
    changed = false;
    for (const b of boxes) {
      if (supported.has(b)) continue;
      const pb = b.body.translation();
      const eb = extent(b);
      const bottom = pb.y - eb.hy;
      // Anything low (a plank lying on the floor) still counts as the floor.
      const onFloor = bottom - floorY < 0.15;
      const onOther = [...supported].some((o) => {
        const po = o.body.translation();
        const eo = extent(o);
        return Math.abs(bottom - (po.y + eo.hy)) < 0.08 && Math.abs(pb.x - po.x) < eb.hx + eo.hx;
      });
      if (onFloor || onOther) {
        supported.add(b);
        // A lone box on the floor isn't a stack.
        if (onOther) best = Math.max(best, pb.y + eb.hy - floorY);
        changed = true;
      }
    }
  }
  return best;
}
