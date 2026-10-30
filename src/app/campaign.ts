import type { Level } from "../levels/level";
import { dingDong } from "../levels/suburb/dingDong";
import { laundryDay } from "../levels/suburb/laundryDay";
import { stackIt } from "../levels/suburb/stackIt";
import { pizzaUp } from "../levels/suburb/pizzaUp";
import { dayOff } from "../levels/dayOff";
import { crateExpectations } from "../levels/docks/crateExpectations";
import { fishToss } from "../levels/docks/fishToss";
import { rollOut } from "../levels/docks/rollOut";
import { crowsNest } from "../levels/docks/crowsNest";
import { movingDay } from "../levels/downtown/movingDay";
import { hangThePainting } from "../levels/downtown/hangThePainting";
import { pinReset } from "../levels/downtown/pinReset";
import { coffeeRun } from "../levels/downtown/coffeeRun";
import { windowWasher } from "../levels/skyscraper/windowWasher";
import { mailRoom } from "../levels/skyscraper/mailRoom";
import { shredIt } from "../levels/skyscraper/shredIt";
import { fireDrill } from "../levels/skyscraper/fireDrill";
import { executiveAction } from "../levels/finale/executiveAction";

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
  { id: "docks", title: "The Docks", review: "review-2", levels: [crateExpectations, fishToss, rollOut, crowsNest] },
  { id: "downtown", title: "Downtown", review: "review-3", levels: [movingDay, hangThePainting, pinReset, coffeeRun] },
  { id: "skyscraper", title: "The Skyscraper", review: "review-4", levels: [windowWasher, mailRoom, shredIt, fireDrill] },
  { id: "corner-office", title: "The Corner Office", levels: [executiveAction] },
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
  "crate-expectations": [
    "MEMO: The boat has been loaded. The harbour has been… involved.",
    "MEMO: Reminder that crates are not luggage. They are cargo. Also not luggage.",
    "MEMO: The crab has been informed of your conduct.",
  ],
  "fish-toss": [
    "MEMO: Fish delivered. Several also delivered to the sea, which we're counting.",
    "MEMO: The fishmonger has asked if you're 'always like this.' I said yes, proudly.",
    "MEMO: Please wash your hands. Please wash the dock.",
  ],
  "roll-out": [
    "MEMO: Barrels: in the hold. Hold: dented. Morale: high.",
    "MEMO: Reminder that 'rolling' is a technique, not a lifestyle.",
    "MEMO: The bollard is fine. The bollard is always fine.",
  ],
  "crows-nest": [
    "MEMO: The bell has been rung. The whole harbour knows. The whole harbour has opinions.",
    "MEMO: Health & Safety would like a word. Several words. A pamphlet.",
    "MEMO: Remember, the fastest way down is not a career strategy.",
  ],
  "moving-day": [
    "MEMO: Sofa delivered. The doorframe has asked for a transfer.",
    "MEMO: Reminder that 'pivot' is a technique, not something you shout at the sofa.",
    "MEMO: The van driver has requested hazard pay. Retroactively.",
  ],
  "hang-the-painting": [
    "MEMO: Painting hung. Curator hung up. Different meanings, same day.",
    "MEMO: Please use the stool. The stool is there for a reason. The reason is you.",
    "MEMO: The gallery has asked us to 'never, ever' again. Strong engagement.",
  ],
  "pin-reset": [
    "MEMO: Pins reset. Staff also need resetting.",
    "MEMO: The bowling alley says you have 'natural spare energy.' Not sure that's a compliment.",
    "MEMO: Reminder that the pins are not to be juggled. Even if you're good at it. You're not.",
  ],
  "coffee-run": [
    "MEMO: Coffee delivered. The carpet also had some.",
    "MEMO: Reception would like their coffee 'less acrobatic' next time.",
    "MEMO: You are now on the do-not-hand-a-tray list. It's a short list. You're on it twice.",
  ],
  "window-washer": [
    "MEMO: Windows clean. The client can see out now. They've asked us to un-see some things.",
    "MEMO: Reminder that the cradle is not a ride. It is, technically, a ride.",
    "MEMO: The bucket has been reported missing. Last seen: falling.",
  ],
  "mail-room": [
    "MEMO: Parcels sorted. Mail room re-sorted. Mail room staff re-hired.",
    "MEMO: Throwing parcels is 'not a delivery method.' I've asked them to define 'method.'",
    "MEMO: Someone in the mail room cried. Happy tears, we've decided.",
  ],
  "shred-it": [
    "MEMO: Documents shredded. Fan also shredded, emotionally.",
    "MEMO: Legal confirms nothing we shred can be used against us. Including this memo.",
    "MEMO: Paper is a renewable resource. Our patience is less renewable.",
  ],
  "fire-drill": [
    "MEMO: Fire drill complete. No fire. Several near-fires.",
    "MEMO: The mannequins have asked to be evacuated from future jobs.",
    "MEMO: Health & Safety would like to thank you for the material.",
  ],
  "executive-action": [
    "MEMO: The file has been moved. History has been made. Shares are up.",
    "MEMO: A statue is being commissioned. Of the file.",
    "MEMO: From the desk of the CEO: …that's you now. Well done.",
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


/** A chapter can be played once the one before it is finished (all jobs done). */
export function chapterUnlocked(index: number, jobsDone: (id: string) => boolean): boolean {
  if (index === 0) return true;
  const prev = CHAPTERS[index - 1];
  return !prev.comingSoon && prev.levels.every((l) => jobsDone(l.id));
}
