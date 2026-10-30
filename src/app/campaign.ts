import type { Level } from "../levels/level";
import { dingDong } from "../levels/suburb/dingDong";
import { laundryDay } from "../levels/suburb/laundryDay";
import { stackIt } from "../levels/suburb/stackIt";
import { pizzaUp } from "../levels/suburb/pizzaUp";
import { dayOff } from "../levels/dayOff";

export interface Chapter {
  id: string;
  title: string;
  /** Cutscene before the first job (if any). */
  intro?: string;
  /** Cutscene after the last job. */
  review?: string;
  levels: Level[];
  /** Shown but not playable yet. */
  comingSoon?: boolean;
}

export const CHAPTERS: Chapter[] = [
  { id: "suburb", title: "The Suburb", intro: "onboarding", review: "review-1", levels: [dingDong, laundryDay, stackIt, pizzaUp] },
  { id: "docks", title: "The Docks", levels: [], comingSoon: true },
  { id: "downtown", title: "Downtown", levels: [], comingSoon: true },
  { id: "skyscraper", title: "The Skyscraper", levels: [], comingSoon: true },
];

export const SANDBOX = dayOff;

export const ALL_LEVELS: Level[] = [...CHAPTERS.flatMap((c) => c.levels), dayOff];

export function levelById(id: string): Level | undefined {
  return ALL_LEVELS.find((l) => l.id === id);
}

export function chapterOf(levelId: string): Chapter | undefined {
  return CHAPTERS.find((c) => c.levels.some((l) => l.id === levelId));
}

/** Seconds → 1–3 stars. */
export function starsFor(level: Level, seconds: number): number {
  return seconds <= level.par[0] ? 3 : seconds <= level.par[1] ? 2 : 1;
}

/** A dry note from the boss on every score card. */
export const MEMOS: Record<string, string[]> = {
  "ding-dong": [
    "MEMO: Client confirms the bell was rung. Several neighbours also confirm this.",
    "MEMO: Great initiative! Please stop ringing it now.",
    "MEMO: The gnome has asked for a transfer.",
  ],
  "laundry-day": [
    "MEMO: Socks: in basket. Basket: mostly in room. Great hustle!",
    "MEMO: Reminder that 'throwing' and 'pitching' are different job codes.",
    "MEMO: Your enthusiasm has been noted. By the neighbours.",
  ],
  "stack-it": [
    "MEMO: Client says the stack is 'structurally confusing.' That's a compliment in engineering.",
    "MEMO: Remember to lift with your legs. Or anything, really.",
    "MEMO: Garage looks great. The car has questions.",
  ],
  "pizza-up": [
    "MEMO: Pizza was 'technically' delivered. Great hustle!",
    "MEMO: Reminder that the stairs are not a shortcut.",
    "MEMO: 4B tipped. In the sense that they tipped over.",
  ],
};

export const TAGS = {
  noFalls: "No Falls",
  speedy: "Speed Demon",
  clumsy: "Clumsy Professional",
  collateral: "Collateral Damage",
} as const;
