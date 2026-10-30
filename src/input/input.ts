import type { Intent } from "../physics/body/stanley";
import { ARM_REACH } from "../physics/body/armController";
import type { Camera } from "../render/renderer";
import { clamp, type Vec } from "../sim/math";

const STICK_RANGE = 60;
const REACH_RANGE = 110;

interface Stick {
  id: number;
  origin: Vec;
  pos: Vec;
  jumped: boolean;
}

/**
 * Turns keyboard, mouse and touch into an Intent.
 *
 * Desktop: A/D run, W/Space jump, mouse points the hands, left/right mouse
 * buttons grip with each hand.
 * Touch: left thumb is a floating stick (flick up to jump); right thumb drags
 * to reach relative to the body and grips with both hands while down.
 */
export class Input {
  private keys = new Set<string>();
  private jumpQueued = false;
  private mouse: Vec | null = null;
  private mouseButtons = { L: false, R: false };
  private moveStick: Stick | null = null;
  private reachStick: Stick | null = null;
  /** Last input was touch; used to pick which hints to show. */
  touch = false;
  onKey: (key: string) => void = () => {};

  constructor(private el: HTMLElement) {
    window.addEventListener("keydown", (e) => {
      if (e.target instanceof HTMLInputElement) return;
      const k = e.key.toLowerCase();
      if (!e.repeat && (k === "w" || k === " " || k === "arrowup")) this.jumpQueued = true;
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
      this.keys.add(k);
      if (!e.repeat) this.onKey(k);
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.mouseButtons = { L: false, R: false };
    });

    el.addEventListener("contextmenu", (e) => e.preventDefault());
    el.addEventListener("pointerdown", (e) => this.down(e));
    el.addEventListener("pointermove", (e) => this.move(e));
    el.addEventListener("pointerup", (e) => this.up(e));
    el.addEventListener("pointercancel", (e) => this.up(e));
    el.addEventListener("pointerleave", (e) => {
      if (e.pointerType === "mouse") this.mouse = null;
    });
  }

  private local(e: PointerEvent): Vec {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private down(e: PointerEvent) {
    const p = this.local(e);
    if (e.pointerType === "mouse") {
      this.touch = false;
      this.mouse = p;
      if (e.button === 0) this.mouseButtons.L = true;
      if (e.button === 2) this.mouseButtons.R = true;
      return;
    }
    this.touch = true;
    this.el.setPointerCapture(e.pointerId);
    const stick: Stick = { id: e.pointerId, origin: p, pos: p, jumped: false };
    if (p.x < this.el.clientWidth / 2) this.moveStick ??= stick;
    else this.reachStick ??= stick;
  }

  private move(e: PointerEvent) {
    const p = this.local(e);
    if (e.pointerType === "mouse") {
      this.mouse = p;
      return;
    }
    for (const s of [this.moveStick, this.reachStick]) {
      if (s?.id !== e.pointerId) continue;
      s.pos = p;
      if (s === this.moveStick) {
        const dy = p.y - s.origin.y;
        if (!s.jumped && dy < -STICK_RANGE * 0.7) {
          this.jumpQueued = true;
          s.jumped = true;
        } else if (dy > -STICK_RANGE * 0.3) s.jumped = false;
      }
    }
  }

  private up(e: PointerEvent) {
    if (e.pointerType === "mouse") {
      if (e.button === 0) this.mouseButtons.L = false;
      if (e.button === 2) this.mouseButtons.R = false;
      return;
    }
    if (this.moveStick?.id === e.pointerId) this.moveStick = null;
    if (this.reachStick?.id === e.pointerId) this.reachStick = null;
  }

  /** Build this frame's intent. Jump is consumed by the first call. */
  read(camera: Camera, shoulder: Vec, facing: 1 | -1): Intent {
    let move = 0;
    if (this.keys.has("a") || this.keys.has("arrowleft")) move -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) move += 1;
    if (this.moveStick) {
      const dx = this.moveStick.pos.x - this.moveStick.origin.x;
      const m = clamp(dx / STICK_RANGE, -1, 1);
      if (Math.abs(m) > 0.15) move = m;
    }

    let reach: Vec | null = null;
    let grip = { L: false, R: false };
    if (this.reachStick) {
      const dx = this.reachStick.pos.x - this.reachStick.origin.x;
      const dy = -(this.reachStick.pos.y - this.reachStick.origin.y);
      const len = Math.hypot(dx, dy);
      if (len < 10) {
        // Just a tap: hands out in front, ready to grab.
        reach = { x: shoulder.x + facing * 0.45, y: shoulder.y - 0.25 };
      } else {
        const d = Math.min(len / REACH_RANGE, 1) * ARM_REACH * 1.1;
        reach = { x: shoulder.x + (dx / len) * d, y: shoulder.y + (dy / len) * d };
      }
      grip = { L: true, R: true };
    } else if (this.mouse && !this.touch) {
      reach = camera.toWorld(this.mouse.x, this.mouse.y);
      grip = { ...this.mouseButtons };
    }

    const jump = this.jumpQueued;
    this.jumpQueued = false;
    return { move, jump, reach, grip };
  }

  /** Mouse world position, for drawing a cursor. */
  cursor(camera: Camera): Vec | null {
    return this.mouse && !this.touch ? camera.toWorld(this.mouse.x, this.mouse.y) : null;
  }

  /** Stick positions for drawing touch controls. */
  sticks() {
    return { move: this.moveStick, reach: this.reachStick, range: { move: STICK_RANGE, reach: REACH_RANGE } };
  }
}
