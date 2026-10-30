import type { Game } from "../sim/game";
import { IDLE_INTENT, type Intent } from "../physics/body/stanley";
import { BOSS, type Incident, type OfficeInstance } from "./office";
import { BARKS, type Script, type Step } from "./scripts";
import type { Bubble } from "../render/renderer";

const CHARS_PER_SEC = 42;
/** Seconds a finished line stays up before moving on by itself. */
const READ_PAUSE = 1.4;
const BARK_TIME = 2.2;

interface Line {
  text: string;
  aside: boolean;
  shown: number;
  /** Time since fully shown. */
  held: number;
}

/**
 * Plays a review script in the office. Stanley is the real ragdoll walking a
 * scripted path, so what he knocks over is different every time; Gerald
 * reacts to each mishap as it happens.
 */
export class Cutscene {
  done = false;
  private i = -1;
  private stepTime = 0;
  private line: Line | null = null;
  private bark: Line | null = null;
  private barked = new Set<Incident>();
  /** Fired with each new character so the UI can blip. */
  onType: (aside: boolean) => void = () => {};

  /**
   * `barkCounts` remembers how many times each object has already been
   * joked about (across cutscenes), so Gerald never repeats himself. It's
   * updated in place.
   */
  constructor(
    readonly script: Script,
    private game: Game,
    private barkCounts: Record<string, number> = {},
  ) {
    this.next();
  }

  private get office() {
    return this.game.inst as OfficeInstance;
  }

  private get step(): Step | undefined {
    return this.script.steps[this.i];
  }

  private next(): void {
    this.i++;
    this.stepTime = 0;
    this.line = null;
    const s = this.step;
    if (!s) {
      this.done = true;
      return;
    }
    if (s.do === "say") this.line = { text: s.text, aside: !!s.aside, shown: 0, held: 0 };
    if (s.do === "ifCalm") {
      if (this.office.mishaps > 0) return this.next();
      this.line = { text: s.text, aside: true, shown: 0, held: 0 };
    }
  }

  /** Tap: finish the current line, or move on if it's finished. */
  advance() {
    const l = this.bark ?? this.line;
    if (!l) return;
    if (l.shown < l.text.length) l.shown = l.text.length;
    else if (this.bark) this.bark = null;
    else this.next();
  }

  skip() {
    this.done = true;
  }

  private type(l: Line, dt: number) {
    const before = Math.floor(l.shown);
    l.shown = Math.min(l.text.length, l.shown + dt * CHARS_PER_SEC);
    if (Math.floor(l.shown) !== before && Math.floor(l.shown) % 2 === 0) this.onType(l.aside);
    if (l.shown >= l.text.length) l.held += dt;
  }

  /** Advance the script; returns what Stanley should do this frame. */
  update(dt: number): Intent {
    if (this.done) return IDLE_INTENT;
    this.stepTime += dt;

    for (const inc of this.office.takeIncidents(this.game)) {
      if (this.barked.has(inc)) continue;
      this.barked.add(inc);
      const n = this.barkCounts[inc] ?? 0;
      const lines = BARKS[inc];
      const line = lines[n % lines.length];
      this.barkCounts[inc] = n + 1;
      this.bark = { text: line, aside: true, shown: 0, held: 0 };
    }

    if (this.bark) {
      this.type(this.bark, dt);
      if (this.bark.held > BARK_TIME - 1) this.bark = null;
    }

    const s = this.step!;
    let intent: Intent = IDLE_INTENT;
    switch (s.do) {
      case "walk": {
        const x = this.game.stanley.rig.pelvis.translation().x;
        const dx = s.to - x;
        if (Math.abs(dx) < 0.15 || this.stepTime > 8) this.next();
        else intent = { ...IDLE_INTENT, move: Math.sign(dx) * Math.min(1, Math.abs(dx) + 0.3) * 0.8 };
        break;
      }
      case "fidget": {
        const item = this.office.item(s.at);
        const p = item?.body.translation() ?? { x: BOSS.x, y: 1.2 };
        // A friendly reach for it… ending somewhere past it.
        const wobble = Math.sin(this.stepTime * 9) * 0.25;
        intent = { ...IDLE_INTENT, reach: { x: p.x + 0.3 + wobble, y: p.y + 0.05 } };
        if (this.stepTime > s.time) this.next();
        break;
      }
      case "wait":
        if (this.stepTime > s.time) this.next();
        break;
      case "say":
      case "ifCalm":
        // Lines wait while Gerald handles an interruption.
        if (this.line && !this.bark) {
          this.type(this.line, dt);
          if (this.line.held > READ_PAUSE + this.line.text.length * 0.012) this.next();
        }
        break;
    }
    const cur = this.bark ?? this.line;
    this.office.talking = !!cur && cur.shown < cur.text.length;
    // Stage directions like "*Loud, disappointed sip.*" get acted out.
    this.office.sipping = !!cur && cur.text.startsWith("*") && /sip/i.test(cur.text);
    return intent;
  }

  bubble(): Bubble | null {
    const l = this.bark ?? this.line;
    if (!l) return null;
    return { anchor: { x: BOSS.x - 0.15, y: BOSS.headY + 0.2 }, text: l.text, shown: l.shown, aside: l.aside };
  }
}
