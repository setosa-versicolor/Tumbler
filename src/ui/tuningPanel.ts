import { clearErrorLog, errorLog, errorLogText, onErrorLogChange } from "../app/errorLog";
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

  // Share the game with a friend, by text.
  const share = document.createElement("a");
  share.className = "share";
  share.textContent = "💬 Text it to a friend";
  const url = location.origin + location.pathname;
  share.href = `sms:?&body=${encodeURIComponent(`Play Tumbler: you're Stanley, the clumsiest temp at Odd Jobs Ltd. ${url}`)}`;
  panel.append(share);

  const title = document.createElement("h2");
  title.textContent = "Tuning";
  panel.append(title);

  // The settings are good as they are: locked until you insist.
  const lockRow = document.createElement("div");
  lockRow.className = "lock";
  const lockButton = document.createElement("button");
  const lockNote = document.createElement("p");
  lockRow.append(lockButton, lockNote);
  panel.append(lockRow);
  let locked = true;

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

  const setLocked = (on: boolean) => {
    locked = on;
    for (const { input } of inputs.values()) input.disabled = on;
    panel.classList.toggle("locked", on);
    lockButton.textContent = on ? "🔒 Unlock" : "Reset to Defaults";
    lockNote.textContent = on ? "You can change everything. But you probably shouldn't." : "We warned you.";
  };
  lockButton.addEventListener("click", () => {
    if (locked) return setLocked(false);
    Object.assign(tuning, DEFAULT_TUNING);
    for (const r of TUNING_RANGES) {
      const el = inputs.get(r.key)!;
      el.input.value = String(tuning[r.key]);
      el.out.textContent = fmt(tuning[r.key], r.step);
    }
    saveTuning(tuning);
  });
  setLocked(true);

  const buttons = document.createElement("div");
  buttons.className = "buttons";
  const reset = document.createElement("button");
  reset.textContent = "Reset room";
  reset.addEventListener("click", onResetRoom);
  buttons.append(reset);
  panel.append(buttons);

  // The error log: what went wrong on this device, ready to copy and send.
  const logTitle = document.createElement("h2");
  const logBox = document.createElement("pre");
  logBox.className = "error-log";
  const logButtons = document.createElement("div");
  logButtons.className = "buttons";
  const copy = document.createElement("button");
  copy.textContent = "Copy log";
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(errorLogText());
      copy.textContent = "Copied!";
    } catch {
      // No clipboard (or no permission): select the text so it can be copied by hand.
      const range = document.createRange();
      range.selectNodeContents(logBox);
      getSelection()?.removeAllRanges();
      getSelection()?.addRange(range);
      copy.textContent = "Selected — copy it";
    }
    setTimeout(() => (copy.textContent = "Copy log"), 2000);
  });
  const clear = document.createElement("button");
  clear.textContent = "Clear log";
  clear.addEventListener("click", clearErrorLog);
  logButtons.append(copy, clear);
  panel.append(logTitle, logBox, logButtons);

  const toggle = document.createElement("button");
  toggle.className = "gear";
  toggle.setAttribute("aria-label", "Tuning");
  toggle.textContent = "⚙";
  // Every time it's opened, it's locked again.
  const flip = () => {
    if (panel.hidden) setLocked(true);
    panel.hidden = !panel.hidden;
  };
  toggle.addEventListener("click", flip);

  const showLog = () => {
    const entries = errorLog();
    logTitle.textContent = `Error log (${entries.length})`;
    logBox.textContent = entries.length
      ? entries.map((e) => `${e.at.slice(5, 19).replace("T", " ")} ${e.kind}: ${e.message}${e.detail ? `\n${e.detail}` : ""}`).join("\n\n")
      : "Nothing's gone wrong. Yet.";
    copy.disabled = clear.disabled = !entries.length;
    toggle.classList.toggle("has-errors", entries.length > 0);
  };
  showLog();
  onErrorLogChange(showLog);

  root.append(toggle, panel);
  return { toggle: flip };
}
