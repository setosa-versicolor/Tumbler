import type { RigidBody } from "@dimforge/rapier2d-deterministic-compat";
import { DT } from "../physics/world";
import { IDLE_INTENT, type Intent } from "../physics/body/stanley";
import { Game, type GameEvent } from "../sim/game";
import type { Tuning } from "../sim/tuning";
import type { Level } from "../levels/level";
import { Renderer } from "../render/renderer";
import { Input } from "../input/input";
import { Cutscene } from "../story/cutscene";
import { BOSS, office, type OfficeInstance } from "../story/office";
import { SCRIPTS } from "../story/scripts";
import { CHAPTERS, chapterOf, MEMOS, OVERTIME_MEMOS, overtimeBonus, overtimeOpen, SANDBOX, starsFor, TAGS, type Chapter } from "./campaign";
import { LEVEL_TWISTS, twistFor } from "../levels/twists";
import { clearSave, emptySave, loadSave, recordJob, recordOvertime, writeSave, type SaveData } from "./save";
import { boardCard, chapterCard, endCard, golfCard, introCard, pressCard, resultsCard } from "../ui/screens";
import { STAFF_CHEERS, STAFF_SPOTS } from "../levels/finale/executiveAction";
import { sfx } from "../ui/audio";
import { logError } from "./errorLog";

const MAX_STEPS_PER_FRAME = 8;
/** The last job; finishing it the first time plays the ending. */
const FINALE = "executive-action";
/** Seconds (ms) between each member of staff cheering, at the end. */
const CHEER_GAP = 2400;
const TRIP_WORDS = ["Whoa!", "Wha—", "Oof!", "Hup—no!", "Yikes!"];
const BREAK_WORDS = ["CRASH!", "Oops.", "Whoops!", "…Sorry.", "SMASH!", "Uh-oh."];
const BREAK_BILLS = [
  "Billed to your mother.",
  "Deducted from your pay, which is now negative.",
  "The client says it was 'irreplaceable.' We've replaced it with an apology.",
  "Gerald has 'taken care of it.'",
];

type Mode =
  | { kind: "intro" }
  | { kind: "play"; start: number }
  | { kind: "celebrate"; start: number }
  | { kind: "results" }
  | { kind: "sandbox" }
  | { kind: "cutscene"; scene: Cutscene; then: () => void; ending: boolean }
  /** The staff go wild; `cheer` is who's speaking (the camera goes to them). */
  | { kind: "ending"; cheer: number }
  | { kind: "card" };

export interface Dom {
  canvas: HTMLCanvasElement;
  overlay: HTMLElement;
  title: HTMLElement;
  status: HTMLElement;
  icon: HTMLElement;
  timer: HTMLElement;
  hint: HTMLElement;
  menu: HTMLButtonElement;
  reset: HTMLButtonElement;
  skip: HTMLButtonElement;
  fade: HTMLElement;
}

/** Runs the whole game: which level or cutscene is on, the cards over it, and saving. */
export class App {
  readonly renderer: Renderer;
  readonly input: Input;
  game!: Game;
  mode: Mode = { kind: "card" };
  save: SaveData;
  private acc = 0;
  /** The last couple of seconds of motion, for the error log if the physics blows up. */
  private trail: string[] = [];
  /** Extra time scaling for slow-mo moments. */
  private warp = 1;
  private wasDown = false;
  private airTime = 0;
  /** True while the job board covers the game. */
  private paused = false;
  /** Playing with an Overtime twist. */
  private overtime = false;
  /** The job board is showing the Overtime list. */
  private boardOvertime = false;
  /** Closes the job board, if it can be closed. */
  private boardClose: (() => void) | null = null;

  constructor(private dom: Dom, private tuning: Tuning) {
    this.renderer = new Renderer(dom.canvas);
    this.input = new Input(dom.canvas);
    this.save = loadSave();

    this.input.onTap = () => this.tap();
    this.input.onKey = (k) => this.key(k);
    dom.menu.addEventListener("click", () => this.toggleBoard());
    dom.reset.addEventListener("click", () => this.restart());
    dom.skip.addEventListener("click", () => {
      if (this.mode.kind === "cutscene") this.mode.scene.skip();
    });
    window.addEventListener("resize", () => this.renderer.resize());
    this.renderer.resize();
  }

  /** Pick up where the player left off. */
  start() {
    for (const ch of CHAPTERS) {
      if (ch.comingSoon) break;
      if (ch.intro && !this.save.seen[ch.intro]) return this.playCutscene(ch.intro, () => this.startLevel(ch.levels[0]));
      const next = ch.levels.find((l) => !this.save.jobs[l.id]);
      if (next) return this.startLevel(next);
      if (ch.review && !this.save.seen[ch.review]) return this.playCutscene(ch.review, () => this.chapterDone(ch));
    }
    this.load(SANDBOX);
    this.mode = { kind: "sandbox" };
    this.showBoard();
  }

  // ------------------------------------------------------------ flow ---

  private load(level: Level) {
    this.trail = [];
    const twist = this.overtime && !level.sandbox ? twistFor(level.id) : null;
    this.game = new Game(this.tuning, level, 1, twist);
    this.renderer.camera.setLevel(level);
    this.renderer.clearFx();
    this.renderer.camera.follow(this.game.stanley.position, 0, true);
    this.input.release();
    this.warp = 1;
    this.acc = 0;
    this.dom.overlay.replaceChildren();
    this.paused = false;
    this.boardClose = null;
  }

  private fadeThen(fn: () => void) {
    this.dom.fade.classList.add("on");
    setTimeout(() => {
      fn();
      this.dom.fade.classList.remove("on");
    }, 180);
  }

  startLevel(level: Level, overtime = false) {
    this.fadeThen(() => {
      this.overtime = overtime;
      this.load(level);
      if (level.sandbox) {
        this.mode = { kind: "sandbox" };
        return;
      }
      const ch = chapterOf(level.id)!;
      const idx = ch.levels.indexOf(level);
      if (level.target) this.renderer.camera.follow(level.target, 0, true);
      this.mode = { kind: "intro" };
      const twist = overtime ? twistFor(level.id) : null;
      this.dom.overlay.replaceChildren(
        introCard({
          kicker: twist ? `🔥 Overtime · ${ch.title}` : `Job ${idx + 1} of ${ch.levels.length} · ${ch.title}`,
          level,
          record: this.save.jobs[level.id],
          twist: twist ? { name: twist.name, blurb: twist.blurb, bonus: this.save.overtime[level.id]?.bonus ?? 0 } : undefined,
          controls: this.input.touch
            ? "Left thumb: run (flick up to jump) · Right thumb: drag to reach, hold to grab"
            : "A/D run · W jump · Mouse points hands · Hold click to grab · R restart",
          onStart: () => this.clockIn(),
        }),
      );
    });
  }

  private clockIn() {
    if (this.mode.kind !== "intro") return;
    sfx.click();
    this.dom.overlay.replaceChildren();
    this.input.release();
    this.mode = { kind: "play", start: this.game.time };
  }

  restart() {
    if (this.mode.kind === "cutscene") return;
    sfx.click();
    if (this.mode.kind === "sandbox") {
      this.load(this.game.level);
      this.mode = { kind: "sandbox" };
      return;
    }
    // Straight back in, no intro card: getting stuck should cost one tap.
    this.load(this.game.level);
    this.mode = { kind: "play", start: 0 };
  }

  private complete() {
    if (this.mode.kind !== "play") return;
    const time = (this.game.doneAt ?? this.game.time) - this.mode.start;
    const level = this.game.level;
    const stars = starsFor(level, time);
    const tags: string[] = [];
    if (this.game.falls === 0) tags.push(TAGS.noFalls);
    if (time <= level.par[0] * 0.6) tags.push(TAGS.speedy);
    if (this.game.falls >= 3) tags.push(TAGS.clumsy);
    if (this.game.breaks > 0) tags.push(TAGS.collateral);
    // Overtime scores bonus stars instead of the regular ones.
    const overtime = this.overtime;
    const bonus = overtimeBonus(level, time, this.game.breaks);
    if (overtime) {
      tags.length = 0;
      if (bonus >= 1) tags.push("★4 Beat the clock");
      if (bonus >= 2) tags.push("★5 Nothing broken");
      if (bonus === 0) tags.push(`★4 needs under ${level.par[0]}s`);
      else if (bonus === 1) tags.push("★5: break nothing");
    }
    const { newBest } = overtime ? recordOvertime(this.save, level.id, bonus, time) : recordJob(this.save, level.id, stars, time, tags);
    writeSave(this.save);

    sfx.complete();
    this.renderer.confetti({ x: this.game.stanley.position.x, y: this.game.stanley.position.y + 1.2 });
    this.renderer.camera.punch = 0.08;
    this.warp = 0.3;
    this.mode = { kind: "celebrate", start: this.mode.start };

    if (level.id === FINALE && !overtime && !this.save.seen.ending) return this.ending();
    setTimeout(() => {
      this.warp = 1;
      if (this.mode.kind !== "celebrate") return;
      this.mode = { kind: "results" };
      const memos = (overtime ? OVERTIME_MEMOS[LEVEL_TWISTS[level.id]] : MEMOS[level.id]) ?? ["MEMO: Great hustle!"];
      const { next, label } = this.nextAfter(level);
      this.dom.overlay.replaceChildren(
        resultsCard({
          level,
          stars,
          time,
          newBest,
          tags,
          memo:
            memos[Math.floor(Math.random() * memos.length)] +
            (this.game.breaks > 0 ? ` Breakages: ${this.game.breaks}. ${BREAK_BILLS[Math.floor(Math.random() * BREAK_BILLS.length)]}` : ""),
          nextLabel: label,
          onRetry: () => this.startLevel(level, overtime),
          onNext: next,
          overtime: overtime ? { regular: this.save.jobs[level.id]?.stars ?? 0, bonus } : undefined,
        }),
      );
      const ding = overtime ? (bonus ? 3 + bonus : 0) : stars;
      for (let i = 0; i < ding; i++) setTimeout(() => sfx.star(i), 250 + i * 180);
    }, 1300);
  }

  private nextAfter(level: Level): { next: () => void; label: string } {
    if (this.overtime) {
      const all = CHAPTERS.flatMap((c) => c.levels);
      const following = all[all.indexOf(level) + 1];
      if (following) return { next: () => this.startLevel(following, true), label: "Next overtime ▸" };
      return { next: () => this.showBoard(), label: "Job Board ▸" };
    }
    const ch = chapterOf(level.id)!;
    const following = ch.levels[ch.levels.indexOf(level) + 1];
    if (following) return { next: () => this.startLevel(following), label: "Next job ▸" };
    if (ch.review && !this.save.seen[ch.review]) {
      return { next: () => this.playCutscene(ch.review!, () => this.chapterDone(ch)), label: "See the boss ▸" };
    }
    const after = CHAPTERS[CHAPTERS.indexOf(ch) + 1];
    if (after && !after.comingSoon) return { next: () => this.startLevel(after.levels[0]), label: `${after.title} ▸` };
    return { next: () => this.showBoard(), label: "Job Board ▸" };
  }

  private chapterDone(ch: Chapter) {
    const next = CHAPTERS[CHAPTERS.indexOf(ch) + 1];
    this.load(SANDBOX);
    this.mode = { kind: "card" };
    this.dom.overlay.replaceChildren(
      chapterCard({
        title: ch.title,
        next: next?.title ?? "???",
        ready: !!next && !next.comingSoon,
        onNext: () => next && this.startLevel(next.levels[0]),
        onBoard: () => this.showBoard(),
        onSandbox: () => this.startLevel(SANDBOX),
      }),
    );
  }

  /**
   * The end of the game: the staff go wild, one line at a time, then the
   * newspaper, the golf course, and the end card.
   */
  private ending() {
    setTimeout(() => {
      this.warp = 1;
      if (this.mode.kind !== "celebrate") return;
      this.mode = { kind: "ending", cheer: -1 };
      STAFF_CHEERS.forEach((line, i) =>
        setTimeout(() => {
          if (this.mode.kind !== "ending") return;
          this.mode.cheer = i;
          const at = STAFF_SPOTS[i];
          this.renderer.clearNotes();
          this.renderer.note(line, { x: at.x, y: at.y + 0.9 });
          this.renderer.confetti({ x: at.x, y: at.y + 0.5 });
          sfx.score();
        }, 900 + i * CHEER_GAP),
      );
      setTimeout(() => {
        if (this.mode.kind !== "ending") return;
        this.renderer.clearNotes();
        sfx.complete();
        this.dom.overlay.replaceChildren(
          pressCard({
            onNext: () =>
              this.dom.overlay.replaceChildren(
                golfCard({
                  onNext: () => {
                    this.save.seen.ending = true;
                    writeSave(this.save);
                    this.dom.overlay.replaceChildren(endCard({ onBoard: () => this.showBoard() }));
                  },
                }),
              ),
          }),
        );
      }, 900 + STAFF_CHEERS.length * CHEER_GAP + 600);
    }, 1300);
  }

  playCutscene(id: string, then: () => void) {
    const script = SCRIPTS[id];
    this.fadeThen(() => {
      this.load(office);
      // Extra flail for the walk-in. It's a performance review; nerves are high.
      this.game.tuning = { ...this.tuning, flail: Math.max(this.tuning.flail, 1.3) };
      const scene = new Cutscene(script, this.game, this.save.barks);
      scene.onType = (aside) => sfx.blip(aside);
      this.mode = { kind: "cutscene", scene, then, ending: false };
    });
  }

  private endCutscene() {
    if (this.mode.kind !== "cutscene") return;
    const { then, scene } = this.mode;
    this.save.seen[scene.script.id] = true;
    writeSave(this.save);
    this.renderer.bubble = null;
    this.mode = { kind: "card" };
    then();
  }

  // ------------------------------------------------------------ board ---

  toggleBoard() {
    if (this.dom.overlay.querySelector(".board")) this.boardClose?.();
    else this.showBoard();
  }

  showBoard() {
    sfx.click();
    this.input.release();
    const resumable = this.mode.kind === "play" || this.mode.kind === "sandbox" || this.mode.kind === "intro";
    this.paused = true;
    this.boardClose = resumable
      ? () => {
          this.dom.overlay.replaceChildren();
          this.paused = false;
          this.boardClose = null;
          if (this.mode.kind === "intro") this.startLevel(this.game.level);
        }
      : null;
    const rewatch = Object.values(SCRIPTS)
      .filter((s) => this.save.seen[s.id])
      .map((s) => ({ id: s.id, title: s.title }));
    this.dom.overlay.replaceChildren(
      boardCard({
        chapters: CHAPTERS,
        save: this.save,
        sandbox: SANDBOX,
        rewatch,
        overtime: overtimeOpen(this.save.seen)
          ? {
              on: this.boardOvertime,
              twistName: (id) => twistFor(id)?.name ?? "",
              onToggle: (on) => {
                this.boardOvertime = on;
                this.showBoard();
              },
            }
          : undefined,
        onPlay: (l) => this.startLevel(l, this.boardOvertime && overtimeOpen(this.save.seen)),
        onSandbox: () => this.startLevel(SANDBOX),
        onRewatch: (id) => this.playCutscene(id, () => this.showBoard()),
        onReset: () => {
          clearSave();
          this.save = emptySave();
          this.start();
        },
        onClose: this.boardClose ?? undefined,
      }),
    );
  }

  // ------------------------------------------------------------ input ---

  private tap() {
    if (this.paused) return;
    if (this.mode.kind === "cutscene") this.mode.scene.advance();
    else if (this.mode.kind === "intro") this.clockIn();
  }

  private key(k: string) {
    if (k === "escape") return this.toggleBoard();
    if (this.paused) return;
    if (this.mode.kind === "cutscene") {
      if (k === "enter" || k === " ") this.mode.scene.advance();
      return;
    }
    if (k === "r") return this.restart();
    if (this.mode.kind === "intro" && k !== "t") return this.clockIn();
    if (this.mode.kind === "results" && (k === "enter" || k === " ")) {
      (this.dom.overlay.querySelector("button.primary") as HTMLButtonElement | null)?.click();
    }
  }

  // ------------------------------------------------------------ frame ---

  frame(dt: number) {
    const g = this.game;
    if (!g) return;
    const m = this.mode;
    const live = !this.paused && m.kind !== "card";

    let intent: Intent = IDLE_INTENT;
    if (m.kind === "play" || m.kind === "sandbox") {
      const st = g.stanley;
      const floor = Number.isFinite(st.balance.groundDist) ? st.rig.pelvis.translation().y - st.balance.groundDist : undefined;
      intent = this.input.read(this.renderer.camera, st.shoulder, st.facing, floor);
    } else {
      this.input.read(this.renderer.camera, g.stanley.shoulder, g.stanley.facing);
    }
    if (m.kind === "cutscene") {
      intent = m.scene.update(dt);
      // Push in on the desk for the reveal.
      if ((g.inst as OfficeInstance).focus) this.renderer.camera.punch = 0.35;
      this.renderer.bubble = m.scene.bubble();
      if (m.scene.done && !m.ending) {
        m.ending = true;
        this.fadeThen(() => this.endCutscene());
      }
    }

    if (live) {
      this.acc += dt * this.tuning.timeScale * this.warp;
      let steps = 0;
      while (this.acc >= DT && steps < MAX_STEPS_PER_FRAME) {
        this.handle(g.step(intent));
        if (this.watchdog(g, intent)) return;
        intent = { ...intent, jump: false };
        this.acc -= DT;
        steps++;
      }
      if (steps === MAX_STEPS_PER_FRAME) this.acc = 0;
    }

    this.feel(dt);
    const cam = this.renderer.camera;
    // During the intro card the camera shows the goal, then pans to Stanley on clock-in.
    const focus =
      m.kind === "ending"
        ? // The camera goes over to the staff, and along them as each one speaks.
          { x: m.cheer >= 0 ? STAFF_SPOTS[m.cheer].x : STAFF_SPOTS[0].x - 0.6, y: 2.0 }
        : m.kind === "cutscene"
        ? ((g.inst as OfficeInstance).focus ?? { x: (g.stanley.position.x + BOSS.x) / 2, y: 1.6 })
        : m.kind === "intro" && g.level.target
          ? g.level.target
          : g.stanley.position;
    this.renderer.goal = m.kind === "play" && g.level.target ? { pos: g.level.target, icon: g.level.icon } : null;
    cam.follow(focus, dt);
    this.renderer.cursor = m.kind === "play" || m.kind === "sandbox" ? this.input.cursor(cam) : null;
    this.renderer.draw(g, live ? dt : 0);
    this.drawSticks();
    this.hud();
  }

  /**
   * If the physics has blown up (a body's position has gone to NaN or flown
   * off to infinity), log what happened and restart the level, rather than
   * leaving Stanley and everything else vanished. Returns true if it did.
   */
  private watchdog(g: Game, intent: Intent): boolean {
    const bodies: { what: string; body: RigidBody }[] = [
      ...g.stanley.rig.bodies.map((body, i) => ({ what: `stanley#${i}`, body })),
      ...g.props.map((p) => ({ what: p.kind, body: p.body })),
    ];
    let fastest = { what: "", speed: 0 };
    let bad: string | null = null;
    for (const { what, body } of bodies) {
      const p = body.translation();
      const v = body.linvel();
      const speed = Math.hypot(v.x, v.y);
      if (!Number.isFinite(p.x + p.y + speed + body.rotation()) || Math.abs(p.x) > 1e4 || Math.abs(p.y) > 1e4) {
        bad ??= `${what} at ${p.x},${p.y} v ${v.x},${v.y} rot ${body.rotation()}`;
      } else if (speed > fastest.speed) fastest = { what, speed };
    }
    const f = (n: number) => n.toFixed(2);
    if (Math.round(g.time * 120) % 12 === 0) {
      const pel = g.stanley.rig.pelvis.translation();
      const held = g.props.filter((p) => g.held.has(p.body)).map((p) => p.kind);
      const r = intent.reach;
      this.trail = [
        ...this.trail,
        `t ${f(g.time)} pelvis ${f(pel.x)},${f(pel.y)} ${g.stanley.balance.posture} fastest ${fastest.what} ${f(fastest.speed)} held [${held}] move ${f(intent.move)} reach ${r ? `${f(r.x)},${f(r.y)}` : "-"} grip ${intent.grip.L || intent.grip.R}`,
      ].slice(-20);
    }
    if (!bad) return false;
    const twist = g.twist ? " (overtime)" : "";
    logError("physics", `Physics blew up in ${g.level.id}${twist}: ${bad}`, this.trail.join("\n"));
    this.trail = [];
    if (this.mode.kind === "play" || this.mode.kind === "sandbox") {
      this.restart();
      this.renderer.popup("Stanley briefly left this plane of existence.", this.game.stanley.position, "#e85d5d");
    }
    return true;
  }

  private handle(events: GameEvent[]) {
    const r = this.renderer;
    for (const ev of events) {
      switch (ev.type) {
        case "press":
          sfx.press();
          break;
        case "score":
          r.popup(ev.text, ev.pos, "#37a59c");
          if (ev.text.startsWith("DING")) sfx.dingDong();
          else sfx.score();
          break;
        case "fall":
          sfx.fall();
          r.dizzy(ev.pos);
          r.camera.shake(8);
          break;
        case "impact":
          sfx.thud(ev.strength / 9);
          if (ev.strength > 7) {
            r.camera.shake(4);
            r.dust(ev.pos, 0.6);
          }
          break;
        case "throw":
          sfx.whoosh(ev.speed);
          break;
        case "surprise":
          r.note(ev.text, ev.pos);
          break;
        case "splash":
          r.splash(ev.pos, ev.big);
          sfx.splash(ev.big);
          if (ev.big) r.popup("SPLOOSH!", { x: ev.pos.x, y: ev.pos.y + 1 }, "#3b6ea8");
          break;
        case "ouch":
          sfx.bonk();
          r.popup(ev.text, ev.pos, "#c0392b");
          r.camera.shake(9);
          break;
        case "sfx":
          if (ev.name === "boom") sfx.boom();
          else if (ev.name === "rumble") sfx.rumble();
          else if (ev.name === "poop") sfx.poop();
          else if (ev.name === "gust") sfx.gust();
          break;
        case "trip":
          sfx.trip();
          r.popup(TRIP_WORDS[Math.floor(Math.random() * TRIP_WORDS.length)], { x: ev.pos.x, y: ev.pos.y + 0.5 }, "#f08a3c");
          break;
        case "break":
          sfx.crash();
          r.popup(BREAK_WORDS[Math.floor(Math.random() * BREAK_WORDS.length)], { x: ev.pos.x, y: ev.pos.y + 0.6 }, "#c0392b");
          r.camera.shake(7);
          r.dust(ev.pos, 1.2);
          break;
        case "complete":
          this.complete();
          break;
      }
    }
  }

  /** Little bits of feedback that don't come from the sim: landing dust, the "hup!". */
  private feel(dt: number) {
    const b = this.game.stanley.balance;
    const down = b.posture !== "up";
    if (this.wasDown && !down) sfx.hup();
    this.wasDown = down;
    if (!b.grounded) this.airTime += dt;
    else {
      if (this.airTime > 0.35) {
        const p = this.game.stanley.rig.pelvis.translation();
        this.renderer.dust({ x: p.x, y: p.y - b.groundDist });
        sfx.land();
      }
      this.airTime = 0;
    }
  }

  private hud() {
    const { title, status, icon, timer, hint, reset, skip, menu } = this.dom;
    const g = this.game;
    const m = this.mode;
    const cut = m.kind === "cutscene";
    title.textContent = cut ? m.scene.script.title : g.level.title;
    icon.textContent = cut ? "🏢" : g.level.icon;
    status.textContent = cut ? "Gerald's office" : (g.progress.label ?? g.level.goal);
    timer.textContent = m.kind === "play" ? `${(g.time - m.start).toFixed(1)}s` : "";
    reset.hidden = cut || m.kind === "card";
    skip.hidden = !cut;
    menu.hidden = cut;
    const firstTime = !this.save.jobs["ding-dong"];
    hint.textContent =
      (m.kind === "play" && firstTime) || m.kind === "sandbox"
        ? this.input.touch
          ? "Left thumb: run, flick up to jump · Right thumb: drag to reach, hold to grab"
          : "A/D run · W jump · Mouse points hands · Hold left/right click to grab · R restart"
        : cut
          ? "Tap to speed up"
          : m.kind === "play" && this.input.touch && window.innerHeight > window.innerWidth
            ? "↻ Turn your phone sideways for a bigger view"
            : "";
  }

  private drawSticks() {
    const ctx = this.renderer.ctx;
    const { move, reach, range } = this.input.sticks();
    ctx.lineWidth = 3;
    for (const [s, r] of [[move, range.move], [reach, range.reach]] as const) {
      if (!s) continue;
      ctx.strokeStyle = "rgba(42,34,48,0.25)";
      ctx.beginPath();
      ctx.arc(s.origin.x, s.origin.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(42,34,48,0.3)";
      ctx.beginPath();
      ctx.arc(s.pos.x, s.pos.y, 22, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
