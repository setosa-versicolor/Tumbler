import { chapterUnlocked, type Chapter } from "../app/campaign";
import type { JobRecord, SaveData } from "../app/save";
import type { Level } from "../levels/level";

// The DOM cards that sit over the game: job intro, results, job board,
// chapter complete. Built with a tiny element helper; all text is ours.

type Child = Node | string | null | undefined | false;

export function h(tag: string, attrs: Record<string, string | ((e: Event) => void)> = {}, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === "function") el.addEventListener(k, v);
    else el.setAttribute(k, v);
  }
  for (const c of children) if (c) el.append(c);
  return el;
}

const starRow = (n: number, cls = "stars") => h("div", { class: cls }, ...[0, 1, 2].map((i) => h("span", { class: i < n ? "on" : "" }, "★")));

/** Five stars: three from the job, two more from Overtime (in a different colour). */
const starRow5 = (regular: number, bonus: number, cls = "stars") =>
  h(
    "div",
    { class: cls },
    ...[0, 1, 2, 3, 4].map((i) => h("span", { class: `${i < 3 ? (i < regular ? "on" : "") : i - 3 < bonus ? "on bonus" : "bonus-off"}` }, "★")),
  );

const fmt = (s: number) => `${s.toFixed(1)}s`;

export function introCard(o: {
  kicker: string;
  level: Level;
  record?: JobRecord;
  /** Overtime: the twist, and any bonus stars already earned. */
  twist?: { name: string; blurb: string; bonus: number };
  controls: string;
  onStart: () => void;
}): HTMLElement {
  return h(
    "div",
    { class: `card intro ${o.twist ? "overtime" : ""}` },
    h("div", { class: "kicker" }, o.kicker),
    h("div", { class: "big-icon" }, o.level.icon),
    h("h1", {}, o.level.title),
    h("p", { class: "goal" }, o.level.goal),
    o.twist && h("div", { class: "twist" }, h("b", {}, `Twist: ${o.twist.name}. `), o.twist.blurb),
    o.record && !o.twist && h("div", { class: "best" }, starRow(o.record.stars, "stars small"), `Best ${fmt(o.record.best)}`),
    o.twist && h("div", { class: "best" }, starRow5(o.record?.stars ?? 0, o.twist.bonus, "stars small")),
    !o.level.sandbox &&
      h("div", { class: "par" }, o.twist ? `★4: under ${o.level.par[0]}s with the twist · ★5: and break nothing` : `★★★ under ${o.level.par[0]}s`),
    h("button", { class: "primary", click: o.onStart }, "Clock in"),
    h("p", { class: "controls" }, o.controls),
  );
}

export function resultsCard(o: {
  level: Level;
  stars: number;
  time: number;
  newBest: boolean;
  tags: string[];
  memo: string;
  nextLabel: string;
  onRetry: () => void;
  onNext: () => void;
  /** Overtime: show all five stars (three from the job, bonus from this mode). */
  overtime?: { regular: number; bonus: number };
}): HTMLElement {
  const stars = o.overtime ? starRow5(o.overtime.regular, o.overtime.bonus, "stars big") : starRow(o.stars, "stars big");
  return h(
    "div",
    { class: "card results" },
    h("div", { class: "kicker stamp" }, o.overtime ? "OVERTIME DONE" : "JOB DONE"),
    h("h1", {}, `${o.level.icon} ${o.level.title}`),
    stars,
    h("div", { class: "time" }, fmt(o.time), o.newBest && h("span", { class: "new" }, "New best!")),
    o.tags.length > 0 && h("div", { class: "tags" }, ...o.tags.map((t) => h("span", { class: "tag" }, t))),
    h("p", { class: "memo" }, o.memo),
    h(
      "div",
      { class: "row" },
      h("button", { class: "secondary", click: o.onRetry }, "↺ Retry"),
      h("button", { class: "primary", click: o.onNext }, o.nextLabel),
    ),
  );
}

export function boardCard(o: {
  chapters: Chapter[];
  save: SaveData;
  sandbox: Level;
  rewatch: { id: string; title: string }[];
  onPlay: (level: Level) => void;
  onSandbox: () => void;
  onRewatch: (id: string) => void;
  onReset: () => void;
  onClose?: () => void;
  /** After the story: switch between the normal jobs and Overtime. */
  overtime?: { on: boolean; twistName: (levelId: string) => string; onToggle: (on: boolean) => void };
}): HTMLElement {
  const ot = o.overtime;
  const total = o.chapters
    .flatMap((c) => c.levels)
    .reduce((n, l) => n + (o.save.jobs[l.id]?.stars ?? 0) + (o.save.overtime[l.id]?.bonus ?? 0), 0);
  const chapters = o.chapters.map((c, ci) => {
    if (c.comingSoon) {
      return h("section", { class: "chapter soon" }, h("h2", {}, `${ci + 1}. ${c.title}`), h("p", {}, "Coming soon. Gerald is confident it'll be a better fit."));
    }
    const open = chapterUnlocked(ci, (id) => !!o.save.jobs[id]);
    const jobs = c.levels.map((l, i) => {
      const rec = o.save.jobs[l.id];
      if (ot?.on) {
        // Overtime: every job's open, with its twist and five stars to earn.
        return h(
          "button",
          { class: "job overtime", click: () => o.onPlay(l) },
          h("span", { class: "job-icon" }, l.icon),
          h("span", { class: "job-title" }, l.title),
          h("span", { class: "job-new" }, ot.twistName(l.id)),
          starRow5(rec?.stars ?? 0, o.save.overtime[l.id]?.bonus ?? 0, "stars small"),
        );
      }
      const unlocked = open && (i === 0 || !!o.save.jobs[c.levels[i - 1].id]);
      return h(
        "button",
        { class: `job ${unlocked ? "" : "locked"} ${rec ? "done" : ""}`, ...(unlocked ? { click: () => o.onPlay(l) } : { disabled: "" }) },
        h("span", { class: "job-icon" }, unlocked ? l.icon : "🔒"),
        h("span", { class: "job-title" }, l.title),
        rec ? starRow(rec.stars, "stars small") : h("span", { class: "job-new" }, unlocked ? "New" : ""),
      );
    });
    return h("section", { class: "chapter" }, h("h2", {}, `${ci + 1}. ${c.title}`), h("div", { class: "jobs" }, ...jobs));
  });
  const reset = h("button", { class: "link danger" }, "Reset progress");
  reset.addEventListener("click", () => {
    if (reset.dataset.armed) o.onReset();
    else {
      reset.dataset.armed = "1";
      reset.textContent = "Tap again to erase everything";
    }
  });
  return h(
    "div",
    { class: "card board" },
    h("div", { class: "board-head" }, h("div", {}, h("h1", {}, "Job Board"), h("p", { class: "sub" }, `Odd Jobs Ltd. · Employee: Stanley T. · ★ ${total}`)), o.onClose && h("button", { class: "close", click: o.onClose, "aria-label": "Close" }, "✕")),
    ot &&
      h(
        "div",
        { class: "mode-switch" },
        h("button", { class: ot.on ? "" : "on", click: () => ot.onToggle(false) }, "Regular"),
        h("button", { class: ot.on ? "on" : "", click: () => ot.onToggle(true) }, "🔥 Overtime"),
      ),
    ot?.on && h("p", { class: "sub" }, "Every job, with a twist. ★4: beat the ★★★ time anyway. ★5: and break nothing."),
    ...chapters,
    h(
      "section",
      { class: "chapter extras" },
      h("h2", {}, "Extras"),
      h(
        "div",
        { class: "jobs" },
        h("button", { class: "job", click: o.onSandbox }, h("span", { class: "job-icon" }, o.sandbox.icon), h("span", { class: "job-title" }, o.sandbox.title), h("span", { class: "job-new" }, "Free play")),
        ...o.rewatch.map((r) => h("button", { class: "job", click: () => o.onRewatch(r.id) }, h("span", { class: "job-icon" }, "🎬"), h("span", { class: "job-title" }, r.title), h("span", { class: "job-new" }, "Rewatch"))),
      ),
    ),
    reset,
  );
}

export function chapterCard(o: {
  title: string;
  next: string;
  ready: boolean;
  onNext: () => void;
  onBoard: () => void;
  onSandbox: () => void;
}): HTMLElement {
  return h(
    "div",
    { class: "card intro" },
    h("div", { class: "kicker" }, "Chapter complete"),
    h("div", { class: "big-icon" }, "🏅"),
    h("h1", {}, o.title),
    o.ready
      ? h("p", { class: "goal" }, `Next stop: ${o.next}. Gerald is confident it'll be a better fit.`)
      : h("p", { class: "goal" }, `Next stop: ${o.next}. It's still being built. Gerald is confident it'll be a better fit.`),
    h("p", { class: "controls" }, "Or go back for ★★★ on every job, or take a Day Off."),
    h(
      "div",
      { class: "row" },
      h("button", { class: "secondary", click: o.ready ? o.onBoard : o.onSandbox }, o.ready ? "Job Board" : "🛋️ Day Off"),
      h("button", { class: "primary", click: o.ready ? o.onNext : o.onBoard }, o.ready ? `${o.next} ▸` : "Job Board"),
    ),
  );
}

/** The ending, in three cards: the press, the golf course, the end. */
export function pressCard(o: { onNext: () => void }): HTMLElement {
  return h(
    "div",
    { class: "card press" },
    h("div", { class: "masthead" }, "THE DAILY LEDGER"),
    h("div", { class: "kicker" }, "Business · Late edition"),
    h("h1", {}, "CEO Personally Relocates Document; Shares Up 40%"),
    h("p", { class: "goal" }, "Staff describe the moment as \"the bravest thing we've ever seen.\" Analysts are calling it \"hands-on.\""),
    h("p", { class: "memo" }, "★★★★★  \"Finally.\" — Mrs. Henderson, No. 12"),
    h("button", { class: "primary", click: o.onNext }, "Meanwhile… ▸"),
  );
}

export function golfCard(o: { onNext: () => void }): HTMLElement {
  return h(
    "div",
    { class: "card golf" },
    h("div", { class: "big-icon" }, "⛳"),
    h("div", { class: "kicker" }, "Meanwhile, at the golf course"),
    h(
      "div",
      { class: "chat" },
      h("div", { class: "msg them" }, h("span", { class: "who" }, "Office"), "he moved a file"),
      h("div", { class: "msg me" }, "That's my boy."),
    ),
    h("button", { class: "primary", click: o.onNext }, "▸"),
  );
}

export function endCard(o: { onBoard: () => void }): HTMLElement {
  return h(
    "div",
    { class: "card intro end" },
    h("div", { class: "big-icon" }, "🏢"),
    h("h1", {}, "Odd Jobs Ltd."),
    h("p", { class: "goal" }, "We're a family. (Legally a company.)"),
    h("p", { class: "controls" }, "Thanks for playing. Overtime is now open on the Job Board: every job, with a twist, and two more stars to earn."),
    h("button", { class: "primary", click: o.onBoard }, "Job Board"),
  );
}
