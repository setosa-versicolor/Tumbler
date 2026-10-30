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
}

export const emptySave = (): SaveData => ({ v: 1, jobs: {}, seen: {} });

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
    return { v: 1, jobs: data.jobs ?? {}, seen: data.seen ?? {} };
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
