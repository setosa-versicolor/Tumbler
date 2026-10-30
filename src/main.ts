import "./style.css";
import { initPhysics } from "./physics/world";
import { App } from "./app/app";
import { ALL_LEVELS } from "./app/campaign";
import { office } from "./story/office";
import { loadTuning, mountTuningPanel } from "./ui/tuningPanel";
import { unlockAudio } from "./ui/audio";

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

  // Handy for poking at the sim from the devtools console.
  Object.assign(window, { tumbler: { app, tuning, levels: [...ALL_LEVELS, office] } });

  app.start();
  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    app.frame(dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  document.body.classList.add("ready");
}

boot();
