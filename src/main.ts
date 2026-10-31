import "./style.css";
import { initPhysics } from "./physics/world";
import { App } from "./app/app";
import { ALL_LEVELS } from "./app/campaign";
import { office } from "./story/office";
import { loadTuning, mountTuningPanel } from "./ui/tuningPanel";
import { unlockAudio } from "./ui/audio";
import { captureGlobalErrors, logError } from "./app/errorLog";

captureGlobalErrors();

async function boot() {
  await initPhysics();
  const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
  const tuning = loadTuning();
  const app = new App(
    {
      canvas: $("#game"),
      overlay: $("#overlay"),
      title: $("#job-title"),
      status: $("#job-status"),
      icon: $("#job-icon"),
      timer: $("#timer"),
      hint: $("#hint"),
      menu: $("#menu-btn"),
      reset: $("#reset-btn"),
      skip: $("#skip-btn"),
      fade: $("#fade"),
    },
    tuning,
  );
  const panel = mountTuningPanel($("#ui"), tuning, () => app.restart());
  window.addEventListener("keydown", (e) => {
    if (e.key === "`" || e.key.toLowerCase() === "t") panel.toggle();
  });
  window.addEventListener("pointerdown", unlockAudio);
  window.addEventListener("keydown", unlockAudio);
  // iOS Safari ignores user-scalable=no: stop its pinch-zoom, which would let
  // the page pan sideways mid-game.
  for (const ev of ["gesturestart", "gesturechange"]) document.addEventListener(ev, (e) => e.preventDefault());

  // Handy for poking at the sim from the devtools console.
  Object.assign(window, { tumbler: { app, tuning, levels: [...ALL_LEVELS, office] } });

  app.start();
  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    requestAnimationFrame(frame);
    try {
      app.frame(dt);
    } catch (e) {
      // Keep going, but write it down: the log's in the ⚙ panel.
      const err = e as Error;
      logError("error", String(err?.message ?? err), err?.stack);
    }
  };
  requestAnimationFrame(frame);
  document.body.classList.add("ready");
}

boot();
