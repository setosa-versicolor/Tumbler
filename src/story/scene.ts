import type { Bubble } from "../render/renderer";
import type { Vec } from "../sim/math";

const CHARS_PER_SEC = 42;
const READ_PAUSE = 1.4;

export interface SceneLine {
  /** Where the speaker's mouth is, now (they may be moving). */
  at: () => Vec;
  text: string;
}

/**
 * A little scene played out in the level itself, the way Gerald's reviews are:
 * speech bubbles over whoever's talking, typed out, a tap to hurry them along.
 */
export class Scene {
  private i = 0;
  private shown = 0;
  private held = 0;
  done = false;

  constructor(private lines: SceneLine[]) {}

  update(dt: number) {
    if (this.done) return;
    const l = this.lines[this.i];
    this.shown = Math.min(l.text.length, this.shown + dt * CHARS_PER_SEC);
    if (this.shown >= l.text.length) this.held += dt;
    if (this.held > READ_PAUSE + l.text.length * 0.012) this.next();
  }

  /** A tap: finish typing the line, or move on to the next. */
  advance() {
    if (this.done) return;
    const l = this.lines[this.i];
    if (this.shown < l.text.length) this.shown = l.text.length;
    else this.next();
  }

  private next() {
    this.i++;
    this.shown = 0;
    this.held = 0;
    if (this.i >= this.lines.length) this.done = true;
  }

  bubble(): Bubble | null {
    if (this.done) return null;
    const l = this.lines[this.i];
    return { anchor: l.at(), text: l.text, shown: this.shown };
  }

  /** Who's talking (for the camera). */
  speaker(): Vec | null {
    return this.done ? null : this.lines[this.i].at();
  }
}
