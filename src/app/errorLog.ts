// A small error log kept on the device, so a player can copy it from the
// tuning panel and send it over. Holds the last few entries only.

const KEY = "tumbler.errors.v1";
const MAX = 20;

export interface LogEntry {
  /** When, as an ISO string. */
  at: string;
  kind: "error" | "physics";
  message: string;
  /** Anything else useful: the level, a stack, what blew up. */
  detail?: string;
}

function read(): LogEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LogEntry[]) : [];
  } catch {
    return [];
  }
}

let listeners: (() => void)[] = [];
/** Messages already logged this session, so one bug every frame logs once. */
const seen = new Set<string>();

export function logError(kind: LogEntry["kind"], message: string, detail?: string) {
  if (seen.has(kind + message)) return;
  seen.add(kind + message);
  const entries = [...read(), { at: new Date().toISOString(), kind, message, detail }].slice(-MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    // Storage full or blocked: the log is best-effort.
  }
  for (const l of listeners) l();
}

export function errorLog(): LogEntry[] {
  return read();
}

export function clearErrorLog() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
  seen.clear();
  for (const l of listeners) l();
}

export function onErrorLogChange(fn: () => void) {
  listeners = [...listeners, fn];
}

/** The whole log as plain text, for copying. */
export function errorLogText(): string {
  const head = `Tumbler error log · ${navigator.userAgent} · ${innerWidth}x${innerHeight}`;
  return [head, ...read().map((e) => `[${e.at}] ${e.kind}: ${e.message}${e.detail ? `\n${e.detail}` : ""}`)].join("\n\n");
}

/** Uncaught errors and rejected promises go in the log too. */
export function captureGlobalErrors() {
  window.addEventListener("error", (e) => logError("error", String(e.message), e.error?.stack));
  window.addEventListener("unhandledrejection", (e) => logError("error", String(e.reason?.message ?? e.reason), e.reason?.stack));
}
