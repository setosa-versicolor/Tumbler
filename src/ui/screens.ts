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

/** The very first thing a new player sees: what this is, and a button to begin when they're ready. */
export function titleCard(o: { touch: boolean; onStart: () => void }): HTMLElement {
  return h(
    "div",
    { class: "card title" },
    h("img", { class: "title-icon", src: "icon.svg", alt: "" }),
    h("h1", {}, "Tumbler"),
    h(
      "p",
      { class: "pitch" },
      "You're Stanley, the newest temp at Odd Jobs Ltd. The jobs are simple. Your body is not on board.",
    ),
    h("button", { class: "primary", click: o.onStart }, "Start ▸"),
    h(
      "p",
      { class: "controls" },
      o.touch ? "🔊 Sound on · Best played sideways · Your progress saves on this phone." : "🔊 Sound on · Your progress saves in this browser.",
    ),
  );
}

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

/** "Are you sure?", in its own pop-up, before wiping the save. */
export function confirmReset(onConfirm: () => void) {
  const close = () => {
    backdrop.remove();
    removeEventListener("keydown", onKey);
  };
  const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
  const backdrop = h(
    "div",
    { class: "confirm-backdrop", click: (e) => e.target === backdrop && close() },
    h(
      "div",
      { class: "card confirm", role: "alertdialog", "aria-modal": "true" },
      h("div", { class: "big-icon" }, "⚠️"),
      h("h1", {}, "Erase all progress?"),
      h(
        "p",
        { class: "warn" },
        "Every star, every best time, every Overtime bonus and every job you've unlocked will be lost, for good. Stanley starts over on his first day. This can't be undone.",
      ),
      h(
        "div",
        { class: "row" },
        h("button", { class: "secondary", click: close }, "Keep my progress"),
        h("button", { class: "primary danger", click: () => (close(), onConfirm()) }, "Erase everything"),
      ),
    ),
  );
  addEventListener("keydown", onKey);
  document.body.append(backdrop);
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
  reset.addEventListener("click", () => confirmReset(o.onReset));
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
    h("div", { class: "masthead" }, "The Daily Ledger"),
    h("div", { class: "dateline" }, h("span", {}, "Late Edition"), h("span", {}, "Business"), h("span", {}, "Price: one (1) file")),
    h("h1", {}, "CEO Personally Moves Document: Shares Up 40%"),
    h(
      "div",
      { class: "columns" },
      h(
        "div",
        { class: "photo" },
        h("div", { class: "photo-img" }, "📁"),
        h("div", { class: "caption" }, "The document, shortly after being moved."),
      ),
      h(
        "p",
        {},
        h("span", { class: "dropcap" }, "I"),
        "n a move analysts are calling unprecedented, the chief executive of Odd Jobs Ltd. relocated a file from a desk to a cabinet, without assistance. Critics say, \u201cCEOs aren\u2019t supposed to do things.\u201d Staff are calling it \u201cvery hands-on.\u201d",
      ),
    ),
    h("p", { class: "review" }, "\u2605\u2605\u2605\u2605\u2605 \u201cI still want a new doorbell.\u201d \u2014 Mrs. Henderson, No. 12"),
    h("button", { class: "primary", click: o.onNext }, "Meanwhile\u2026 \u25b8"),
  );
}

/**
 * Gerald, on the green, reading a text from the office. Drawn to match the
 * office Gerald: grey hair, round glasses, moustache. Behind him, his ball
 * drops into the hole, and he doesn't notice.
 */
const GOLF_SCENE = `
<svg viewBox="0 0 300 180" role="img" aria-label="Gerald on a golf course, reading his phone">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fd3f0"/><stop offset="1" stop-color="#dff1fb"/></linearGradient>
  </defs>
  <rect width="300" height="180" fill="url(#sky)"/>
  <circle cx="252" cy="32" r="16" fill="#ffe08a"/>
  <ellipse cx="70" cy="128" rx="140" ry="40" fill="#8fcf7a"/>
  <ellipse cx="250" cy="134" rx="120" ry="36" fill="#7bc46a"/>
  <rect y="132" width="300" height="48" fill="#6db35c"/>
  <ellipse cx="236" cy="150" rx="48" ry="9" fill="#8ad97a"/>
  <!-- The flag, and the hole. -->
  <ellipse cx="248" cy="150" rx="6" ry="2.2" fill="#2a2230"/>
  <line x1="248" y1="150" x2="248" y2="98" stroke="#f4f4f4" stroke-width="2"/>
  <path d="M248 98 L272 105 L248 112 Z" fill="#e85d5d" class="flag"/>
  <!-- His ball, rolling in behind him. -->
  <circle r="3" fill="#ffffff" stroke="#c9ccd1" stroke-width="0.6" class="ball"/>
  <!-- Gerald. -->
  <g transform="translate(118 0)">
    <ellipse cx="32" cy="167" rx="30" ry="5" fill="rgba(0,0,0,0.15)"/>
    <rect x="17" y="122" width="12" height="44" rx="4" fill="#d9c9a3"/>
    <rect x="35" y="122" width="12" height="44" rx="4" fill="#d9c9a3"/>
    <rect x="13" y="162" width="18" height="6" rx="3" fill="#2a2230"/>
    <rect x="33" y="162" width="18" height="6" rx="3" fill="#2a2230"/>
    <rect x="10" y="78" width="44" height="50" rx="12" fill="#e8a3b5"/>
    <path d="M26 78 L32 90 L38 78 Z" fill="#f4f4f4"/>
    <!-- The club, in his right hand, resting on the grass. -->
    <line x1="56" y1="112" x2="78" y2="166" stroke="#9aa0a8" stroke-width="2.5"/>
    <path d="M74 166 L86 166 L84 161 Z" fill="#5f6670"/>
    <line x1="50" y1="88" x2="56" y2="112" stroke="#e8a3b5" stroke-width="9" stroke-linecap="round"/>
    <circle cx="56" cy="113" r="4.5" fill="#eebd92"/>
    <!-- The phone, held up to read. -->
    <line x1="14" y1="88" x2="4" y2="70" stroke="#e8a3b5" stroke-width="9" stroke-linecap="round"/>
    <circle cx="3" cy="68" r="4.5" fill="#eebd92"/>
    <rect x="-7" y="52" width="13" height="20" rx="2.5" fill="#2a2230"/>
    <rect x="-5.5" y="54" width="10" height="15" rx="1.5" fill="#bfe6ff" class="screen"/>
    <!-- Head: grey hair, glasses, moustache, a flat cap for the weekend. -->
    <circle cx="30" cy="58" r="18" fill="#eebd92"/>
    <path d="M13 54 Q16 40 30 40 Q46 40 48 54 L44 50 Q30 44 16 50 Z" fill="#9aa0a8"/>
    <path d="M11 44 Q14 30 32 31 Q48 32 50 43 Q34 39 11 44 Z" fill="#4a5160"/>
    <path d="M8 45 L22 41 L22 44 L9 47 Z" fill="#3a404d"/>
    <circle cx="22" cy="59" r="5" fill="none" stroke="#2a2230" stroke-width="1.4"/>
    <circle cx="35" cy="59" r="5" fill="none" stroke="#2a2230" stroke-width="1.4"/>
    <line x1="27" y1="59" x2="30" y2="59" stroke="#2a2230" stroke-width="1.2"/>
    <circle cx="21" cy="60" r="1.3" fill="#2a2230" class="eye"/>
    <circle cx="34" cy="60" r="1.3" fill="#2a2230" class="eye"/>
    <rect x="19" y="66" width="16" height="4" rx="2" fill="#7a7f86"/>
    <path d="M23 72 Q28 75 33 72" fill="none" stroke="#6b2a2a" stroke-width="1.4" class="smile"/>
    <!-- One single, proud tear. -->
    <path d="M38 63 Q40 67 38 69 Q36 67 38 63 Z" fill="#7fc8f8" class="tear"/>
  </g>
</svg>`;

export function golfCard(o: { onNext: () => void }): HTMLElement {
  const scene = h("div", { class: "golf-scene" });
  scene.innerHTML = GOLF_SCENE;
  return h(
    "div",
    { class: "card golf" },
    h("div", { class: "kicker" }, "Meanwhile, at the golf course"),
    h(
      "div",
      { class: "golf-stage" },
      scene,
      h("div", { class: "text-notice" }, h("span", { class: "who" }, "💬 Office"), "he moved a file"),
      h("div", { class: "gerald-says" }, "That's my boy."),
    ),
    h("button", { class: "primary", click: o.onNext }, "The end ▸"),
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

// ---------------------------------------------------------- the gift ---
// The secret ending (Executive Action, in Overtime, all five stars).

const QUANTUM_SCENE = `
<svg viewBox="0 0 300 190" role="img" aria-label="Quantum Labs: a gleaming glass tower">
  <defs>
    <linearGradient id="qsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1640"/><stop offset="1" stop-color="#4b3b8a"/></linearGradient>
    <linearGradient id="qglass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9fe8ff"/><stop offset="1" stop-color="#4f7fd8"/></linearGradient>
  </defs>
  <rect width="300" height="190" fill="url(#qsky)"/>
  <circle cx="40" cy="30" r="1.2" fill="#fff"/><circle cx="90" cy="18" r="1" fill="#fff"/><circle cx="250" cy="40" r="1.4" fill="#fff"/><circle cx="210" cy="14" r="1" fill="#fff"/>
  <rect x="0" y="150" width="300" height="40" fill="#151127"/>
  <!-- The tower: glass, a spire, rings of light orbiting it. -->
  <path d="M120 150 L130 40 L150 18 L170 40 L180 150 Z" fill="url(#qglass)"/>
  <path d="M150 18 L150 150" stroke="rgba(255,255,255,0.35)" stroke-width="1"/>
  <line x1="150" y1="18" x2="150" y2="2" stroke="#c9f4ff" stroke-width="2"/>
  <circle cx="150" cy="2" r="3" fill="#ffffff" class="q-blink"/>
  <ellipse cx="150" cy="80" rx="58" ry="10" fill="none" stroke="#7ff5d5" stroke-width="2" class="q-ring"/>
  <ellipse cx="150" cy="110" rx="70" ry="12" fill="none" stroke="#c58be8" stroke-width="2" class="q-ring q-ring2"/>
  <!-- The sign, and a smaller sign. -->
  <rect x="98" y="122" width="104" height="16" rx="3" fill="#0d0b1e"/>
  <text x="150" y="134" text-anchor="middle" font-size="11" font-weight="800" fill="#7ff5d5" letter-spacing="2">QUANTUM LABS</text>
  <rect x="210" y="132" width="68" height="18" rx="2" fill="#f4f1ea"/>
  <text x="244" y="140" text-anchor="middle" font-size="5" fill="#2a2230">DAYS SINCE LAST</text>
  <text x="244" y="147" text-anchor="middle" font-size="5" fill="#2a2230">TEMPORAL INCIDENT: <tspan font-weight="900" fill="#c0392b">0</tspan></text>
  <line x1="244" y1="150" x2="244" y2="158" stroke="#9aa0a8" stroke-width="2"/>
</svg>`;

export function quantumCard(o: { onNext: () => void }): HTMLElement {
  const scene = h("div", { class: "gift-scene" });
  scene.innerHTML = QUANTUM_SCENE;
  return h(
    "div",
    { class: "card gift" },
    h("div", { class: "kicker" }, "Meanwhile, somewhere considerably more impressive"),
    scene,
    h("button", { class: "primary", click: o.onNext }, "▸"),
  );
}

const LAB_SCENE = `
<svg viewBox="0 0 300 150" role="img" aria-label="A lab: a woman in a lab coat answers the phone">
  <rect width="300" height="150" fill="#e9eef5"/>
  <rect y="118" width="300" height="32" fill="#c9d4dd"/>
  <!-- A glowing tube with a hamster in a tiny helmet, a monitor, a chalkboard. -->
  <rect x="18" y="40" width="34" height="78" rx="14" fill="#bff3ff" stroke="#7fc8f8" stroke-width="2" class="q-glow"/>
  <circle cx="35" cy="96" r="9" fill="#d9a066"/><path d="M27 92 Q35 80 43 92 Z" fill="#9aa0a8"/><circle cx="38" cy="95" r="1.2" fill="#2a2230"/>
  <rect x="70" y="30" width="70" height="44" rx="4" fill="#1b1640"/>
  <path d="M76 60 Q90 36 104 58 T132 48" stroke="#7ff5d5" stroke-width="2" fill="none"/>
  <text x="105" y="70" text-anchor="middle" font-size="5" fill="#c58be8">E = mc² (ish)</text>
  <!-- Her desk. -->
  <rect x="150" y="96" width="130" height="8" fill="#6b5646"/>
  <rect x="160" y="104" width="6" height="14" fill="#6b5646"/><rect x="266" y="104" width="6" height="14" fill="#6b5646"/>
  <!-- Mom: lab coat, glasses, a neat grey-streaked bun, phone to her ear. -->
  <rect x="198" y="62" width="44" height="40" rx="10" fill="#ffffff" stroke="#c9d4dd"/>
  <path d="M214 62 L220 74 L226 62 Z" fill="#5d9de8"/>
  <circle cx="220" cy="46" r="14" fill="#eebd92"/>
  <path d="M206 44 Q208 30 220 30 Q234 30 234 44 Q226 36 206 44 Z" fill="#6b4a3a"/>
  <circle cx="231" cy="30" r="6" fill="#6b4a3a"/><path d="M228 27 Q232 26 234 30" stroke="#c9ccd1" stroke-width="1.2" fill="none"/>
  <circle cx="214" cy="47" r="4" fill="none" stroke="#2a2230" stroke-width="1.2"/><circle cx="225" cy="47" r="4" fill="none" stroke="#2a2230" stroke-width="1.2"/>
  <path d="M216 55 Q220 57 224 55" stroke="#6b2a2a" stroke-width="1.2" fill="none"/>
  <rect x="232" y="40" width="5" height="12" rx="1.5" fill="#2a2230" transform="rotate(15 234 46)"/>
  <line x1="240" y1="70" x2="236" y2="50" stroke="#ffffff" stroke-width="6" stroke-linecap="round"/>
  <!-- A mug: 'WORLD'S OKAYEST SON' (a gift). -->
  <rect x="254" y="86" width="12" height="10" rx="2" fill="#f4f4f4"/>
  <text x="260" y="93" text-anchor="middle" font-size="2.6" fill="#c0392b">OKAYEST</text>
</svg>`;

/** A conversation, a line at a time: Stanley's lines on the right, everyone else's on the left. */
function callCard(kicker: string, scene: string, lines: { who: string; text: string }[], next: string, onNext: () => void): HTMLElement {
  const sc = h("div", { class: "gift-scene" });
  sc.innerHTML = scene;
  const chat = h(
    "div",
    { class: "chat call" },
    ...lines.map((l, i) => {
      const el = h("div", { class: `msg ${l.who === "Stanley" ? "me" : "them"}` }, h("span", { class: "who" }, l.who), l.text);
      el.style.animationDelay = `${0.6 + i * 1.1}s`;
      return el;
    }),
  );
  const btn = h("button", { class: "primary", click: onNext }, next);
  btn.style.animationDelay = `${0.6 + lines.length * 1.1}s`;
  return h("div", { class: "card gift call-card" }, h("div", { class: "kicker" }, kicker), h("div", { class: "call-body" }, sc, chat), btn);
}

export function labCallCard(o: { onNext: () => void }): HTMLElement {
  return callCard(
    "Quantum Labs · Office of the Director",
    LAB_SCENE,
    [
      { who: "Mom", text: "Hello." },
      { who: "Stanley", text: "Mom?" },
      { who: "Mom", text: "Yes, Stanley." },
      { who: "Stanley", text: "Dad says hi." },
      { who: "Mom", text: "Thanks, Stanley. I sent you a gift." },
    ],
    "▸",
    o.onNext,
  );
}

export function callbackCard(o: { onNext: () => void }): HTMLElement {
  return callCard(
    "Back in the office. Slightly singed.",
    LAB_SCENE,
    [
      { who: "Stanley", text: "Hi Mom. Cool gift, but I don't think anybody will want one." },
      { who: "Mom", text: "That's what your father said about you." },
      { who: "Mom", text: "Love you. Bring it back by Friday." },
    ],
    "▸",
    o.onNext,
  );
}

export function giftEndCard(o: { onBoard: () => void }): HTMLElement {
  return h(
    "div",
    { class: "card intro end" },
    h("div", { class: "big-icon" }, "⏳"),
    h("h1", {}, "Odd Jobs Ltd."),
    h("p", { class: "goal" }, "Now also doing time travel. (Legally a company.)"),
    h("p", { class: "controls" }, "You found the secret ending. Gerald would be proud. Gerald is never told about this."),
    h("button", { class: "primary", click: o.onBoard }, "Job Board"),
  );
}

export function partyEndCard(o: { onBoard: () => void }): HTMLElement {
  return h(
    "div",
    { class: "card intro end" },
    h("div", { class: "big-icon" }, "🎉"),
    h("h1", {}, "That's everything."),
    h("p", { class: "goal" }, "Every job done, perfectly. Everyone's gone home. Party on."),
    h("button", { class: "primary", click: o.onBoard }, "Job Board"),
  );
}
