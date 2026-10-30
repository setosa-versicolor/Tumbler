import "./style.css";
import { initPhysics, DT } from "./physics/world";
import { Game } from "./sim/game";
import { Renderer } from "./render/renderer";
import { Input } from "./input/input";
import { loadTuning, mountTuningPanel } from "./ui/tuningPanel";
import { sfx, unlockAudio } from "./ui/audio";

const MAX_STEPS_PER_FRAME = 8;

async function boot() {
  await initPhysics();
  const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
  const ui = document.querySelector<HTMLElement>("#ui")!;
  const hud = document.querySelector<HTMLElement>("#hud")!;
  const hint = document.querySelector<HTMLElement>("#hint")!;

  const tuning = loadTuning();
  const game = new Game(tuning);
  const renderer = new Renderer(canvas);
  const input = new Input(canvas);
  const panel = mountTuningPanel(ui, tuning, () => game.reset());

  // Handy for poking at the sim from the devtools console.
  Object.assign(window, { tumbler: { game, renderer, tuning } });

  input.onKey = (k) => {
    if (k === "r") game.reset();
    if (k === "`" || k === "t") panel.toggle();
  };
  window.addEventListener("pointerdown", unlockAudio, { once: true });
  window.addEventListener("keydown", unlockAudio, { once: true });

  const resize = () => renderer.resize();
  window.addEventListener("resize", resize);
  resize();
  renderer.camera.follow(game.tumbler.position, 0, true);

  let last = performance.now();
  let acc = 0;
  let wasDown = false;
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += dt * tuning.timeScale;

    const tb = game.tumbler;
    const intent = input.read(renderer.camera, tb.shoulder, tb.facing);
    let steps = 0;
    while (acc >= DT && steps < MAX_STEPS_PER_FRAME) {
      for (const ev of game.step(intent)) {
        if (ev.type === "press") {
          sfx.press();
          renderer.popup("DING!", { x: 15.2, y: 2.6 }, "#d6453c");
        } else if (ev.type === "basket") {
          sfx.basket();
          renderer.popup("SWISH!", { x: 0.9, y: 3.8 }, "#37a59c");
        } else if (ev.type === "fall") {
          sfx.fall();
          renderer.dizzy(tb.rig.head.translation());
        }
      }
      intent.jump = false;
      acc -= DT;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) acc = 0;

    const down = tb.balance.posture !== "up";
    if (wasDown && !down) sfx.hup();
    wasDown = down;

    renderer.cursor = input.cursor(renderer.camera);
    renderer.camera.follow(tb.position, dt);
    renderer.draw(game, dt);
    drawSticks();

    const s = game.stats;
    hud.textContent = `Button ${s.presses}  ·  Basket ${s.inBasket}  ·  Stack ${s.stack.toFixed(2)}m (best ${s.bestStack.toFixed(2)}m)`;
    hint.textContent = input.touch
      ? "Left thumb: run, flick up to jump  ·  Right thumb: drag to reach, hold to grab"
      : "A/D run  ·  W jump  ·  Mouse points hands  ·  Hold left/right click to grab with each hand  ·  R reset  ·  T tuning";
    requestAnimationFrame(frame);
  };

  const ctx = canvas.getContext("2d")!;
  const drawSticks = () => {
    const { move, reach, range } = input.sticks();
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
  };

  requestAnimationFrame(frame);
}

boot();
