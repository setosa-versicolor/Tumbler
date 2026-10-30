import { DEFAULT_TUNING, TUNING_RANGES, type Tuning } from "../sim/tuning";

const STORAGE_KEY = "tumbler.tuning.v1";

export function loadTuning(): Tuning {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return { ...DEFAULT_TUNING, ...saved };
  } catch {
    return { ...DEFAULT_TUNING };
  }
}

function saveTuning(t: Tuning) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
  } catch {
    // Storage blocked (private mode etc.) — tuning just won't persist.
  }
}

/** Live sliders for every Tuning value. Edits apply immediately and persist. */
export function mountTuningPanel(root: HTMLElement, tuning: Tuning, onResetRoom: () => void) {
  const panel = document.createElement("div");
  panel.className = "panel";
  panel.hidden = true;

  const inputs = new Map<keyof Tuning, { input: HTMLInputElement; out: HTMLOutputElement }>();
  const fmt = (v: number, step: number) => (step >= 1 ? v.toFixed(0) : step >= 0.1 ? v.toFixed(1) : v.toFixed(2));

  const title = document.createElement("h2");
  title.textContent = "Tuning";
  panel.append(title);

  for (const r of TUNING_RANGES) {
    const row = document.createElement("label");
    row.className = "row";
    const name = document.createElement("span");
    name.textContent = r.label;
    const out = document.createElement("output");
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(r.min);
    input.max = String(r.max);
    input.step = String(r.step);
    input.value = String(tuning[r.key]);
    out.textContent = fmt(tuning[r.key], r.step);
    input.addEventListener("input", () => {
      tuning[r.key] = Number(input.value);
      out.textContent = fmt(tuning[r.key], r.step);
      saveTuning(tuning);
    });
    row.append(name, out, input);
    panel.append(row);
    inputs.set(r.key, { input, out });
  }

  const buttons = document.createElement("div");
  buttons.className = "buttons";
  const defaults = document.createElement("button");
  defaults.textContent = "Defaults";
  defaults.addEventListener("click", () => {
    Object.assign(tuning, DEFAULT_TUNING);
    for (const r of TUNING_RANGES) {
      const el = inputs.get(r.key)!;
      el.input.value = String(tuning[r.key]);
      el.out.textContent = fmt(tuning[r.key], r.step);
    }
    saveTuning(tuning);
  });
  const reset = document.createElement("button");
  reset.textContent = "Reset room";
  reset.addEventListener("click", onResetRoom);
  buttons.append(defaults, reset);
  panel.append(buttons);

  const toggle = document.createElement("button");
  toggle.className = "gear";
  toggle.setAttribute("aria-label", "Tuning");
  toggle.textContent = "⚙";
  toggle.addEventListener("click", () => (panel.hidden = !panel.hidden));

  root.append(toggle, panel);
  return { toggle: () => (panel.hidden = !panel.hidden) };
}
