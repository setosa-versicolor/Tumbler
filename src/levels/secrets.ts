import type { Game, GameEvent } from "../sim/game";
import type { Vec } from "../sim/math";

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const inRect = (p: Vec, r: Rect) => p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1;

/**
 * A hidden thing in the scenery. Found by touching it, or by pointing at it
 * for a moment (for things up on the wall).
 */
export class Curio {
  found = false;
  /** Seconds since found, for animations. */
  age = 0;
  private dwell = 0;

  constructor(
    readonly id: string,
    readonly text: string,
    readonly rect: Rect,
    private lookTime = 0.6,
  ) {}

  update(game: Game, dt: number): GameEvent[] {
    if (this.found) {
      this.age += dt;
      return [];
    }
    const arms = game.stanley.rig.arms;
    const touching = [arms.L.hand, arms.R.hand].some((h) => inRect(h.translation(), this.rect));
    const looking = !!game.intent.reach && inRect(game.intent.reach, this.rect);
    this.dwell = touching || looking ? this.dwell + dt : 0;
    if (this.dwell < (touching ? 0.1 : this.lookTime)) return [];
    return [this.reveal()];
  }

  /** Mark found (for secrets triggered by other means). */
  reveal(): Extract<GameEvent, { type: "secret" }> {
    this.found = true;
    const r = this.rect;
    return { type: "secret", id: this.id, text: this.text, pos: { x: (r.x0 + r.x1) / 2, y: r.y1 + 0.3 } };
  }
}
