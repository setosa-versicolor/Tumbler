import "./style.css";
import { initPhysics } from "./physics/world";
import { App } from "./app/app";
import { ALL_LEVELS } from "./app/campaign";
import { office } from "./story/office";
import { loadTuning, mountTuningPanel } from "./ui/tuningPanel";
import { unlockAudio } from "./ui/audio";
import { captureGlobalErrors, logError } from "./app/errorLog";
import { setOnStale } from "./sim/game";

captureGlobalErrors();
setOnStale((level, kinds, when) => logError("error", `Stale prop(s) ${kinds.join(", ")} found ${when} [in ${level}]`));

const RESUME = "tumbler.resume";
const RELOADED_AT = "tumbler.reloadedAt";

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

  // Back from a crash reload? Straight into the level that was being played.
  let resume: { level: string; overtime: boolean } | null = null;
  try {
    resume = JSON.parse(sessionStorage.getItem(RESUME) ?? "null");
    sessionStorage.removeItem(RESUME);
  } catch {
    resume = null;
  }
  if (resume) app.resume(resume.level, resume.overtime);
  else app.start();
  let reloading = false;
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
      logError("error", `${String(err?.message ?? err)} [in ${app.levelId}]`, err?.stack);
      // A crash inside the physics engine leaves the whole engine unusable
      // (even new worlds), so the only way back is a fresh page. Progress is
      // saved already; come straight back to the same level. If it crashes
      // again straight after a reload, don't loop: leave it (it's logged).
      if (!reloading) {
        reloading = true;
        let again = false;
        try {
          again = Date.now() - Number(sessionStorage.getItem(RELOADED_AT) ?? 0) < 20000;
          sessionStorage.setItem(RELOADED_AT, String(Date.now()));
          const at = app.resumePoint();
          if (at) sessionStorage.setItem(RESUME, JSON.stringify(at));
        } catch {
          // No session storage: just reload.
        }
        if (!again) location.reload();
      }
    }
  };
  requestAnimationFrame(frame);
  document.body.classList.add("ready");
}

boot();
