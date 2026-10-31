// Progress lives in the browser's localStorage, so you can pick up where you
// left off. Every access is guarded: storage can be missing or blocked.

const KEY = "tumbler.save.v1";

export interface JobRecord {
  stars: number;
  /** Best time in seconds. */
  best: number;
  tags: string[];
}

export interface SaveData {
  v: 1;
  jobs: Record<string, JobRecord>;
  /** Cutscenes already watched. */
  seen: Record<string, boolean>;
  /** How many of Gerald's jokes about each object have been used, so none repeat. */
  barks: Record<string, number>;
  /** Overtime results: bonus stars (0–2, for ★4 and ★5) and best time with the twist. */
  overtime: Record<string, OvertimeRecord>;
}

export interface OvertimeRecord {
  bonus: number;
  best: number;
}

export const emptySave = (): SaveData => ({ v: 1, jobs: {}, seen: {}, barks: {}, overtime: {} });

export interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadSave(store: Storage | null = storage()): SaveData {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return emptySave();
    const data = JSON.parse(raw);
    if (data?.v !== 1) return emptySave();
    const save: SaveData = { v: 1, jobs: data.jobs ?? {}, seen: data.seen ?? {}, barks: data.barks ?? {}, overtime: data.overtime ?? {} };
    // ★4 means the ★★★ time was beaten (with a twist, even): that counts for
    // the regular stars too. (Older saves didn't do this.)
    for (const [id, ot] of Object.entries(save.overtime)) if (ot.bonus >= 1 && save.jobs[id]) save.jobs[id].stars = 3;
    return save;
  } catch {
    return emptySave();
  }
}

export function writeSave(data: SaveData, store: Storage | null = storage()) {
  try {
    store?.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage full or blocked: progress just won't persist this session.
  }
}

export function clearSave(store: Storage | null = storage()) {
  try {
    store?.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

/** Merge a finished job into the save, keeping the best of each. */
export function recordJob(data: SaveData, id: string, stars: number, time: number, tags: string[]): { record: JobRecord; newBest: boolean } {
  const prev = data.jobs[id];
  const newBest = !prev || time < prev.best;
  const record: JobRecord = {
    stars: Math.max(stars, prev?.stars ?? 0),
    best: Math.min(time, prev?.best ?? Infinity),
    tags: [...new Set([...(prev?.tags ?? []), ...tags])],
  };
  data.jobs[id] = record;
  return { record, newBest };
}

/**
 * Merge an Overtime finish into the save, keeping the best. `stars` is what
 * the time would earn as a regular job: doing it with a twist counts for the
 * regular stars too.
 */
export function recordOvertime(data: SaveData, id: string, bonus: number, time: number, stars = 0): { record: OvertimeRecord; newBest: boolean } {
  const prev = data.overtime[id];
  const newBest = !prev || time < prev.best;
  const record = { bonus: Math.max(bonus, prev?.bonus ?? 0), best: Math.min(time, prev?.best ?? Infinity) };
  data.overtime[id] = record;
  const job = data.jobs[id];
  if (job) job.stars = Math.max(job.stars, stars);
  return { record, newBest };
}
