import type { Incident } from "./office";

// Everything Gerald says. Reviews are stage directions plus lines; barks are
// his reactions to whatever the physics happened to break.

export type Step =
  | { do: "walk"; to: number }
  | { do: "say"; text: string; aside?: boolean }
  /** Stanley reaches for a desk item for a moment (with predictable results). */
  | { do: "fidget"; at: Incident; time: number }
  | { do: "wait"; time: number }
  /** Only if nothing has been broken yet. */
  | { do: "ifCalm"; text: string };

export interface Script {
  id: string;
  title: string;
  steps: Step[];
}

/**
 * Gerald's reactions to whatever Stanley knocks over, in order. Each time an
 * object comes to grief (across every cutscene, not just this one) he moves
 * on to the next line, so jokes never repeat; once he's run out he just
 * sips his coffee. Later lines call back to earlier ones.
 */
export const BARKS: Record<Incident, string[]> = {
  cooler: [
    "Oh, sure. Just push it over if it's in your way.",
    "Did the water cooler say something mean to you?",
    "Ummm, we really do prefer for the water cooler to be upright…",
    "I had the cooler bolted down. …I see the bolts were optional.",
    "Facilities has stopped asking. They just send a mop now.",
  ],
  mug: [
    "That's fine. I have a spare mug.",
    "That was the spare mug.",
    "I buy mugs in bulk now. The supplier sent us a thank-you card.",
    "This one's plastic. …And it bounces. Good to know.",
    "I'll just drink from the pot.",
  ],
  pens: [
    "Those were the good pens. Were.",
    "Those were the replacement good pens.",
    "I've switched to pencils. You can't spill a pencil. …Apparently you can.",
    "I'll sign things with my finger from now on.",
  ],
  nameplate: [
    "Leave it. It's a nameplate. Everyone knows who I am.",
    "Leave it, leave it. It's only got my name on it.",
    "I'm having that glued down. Facing the right way, for once.",
    "You know what, it's safer face-down.",
  ],
  photo: [
    "Don't— I'll get that. Later. When you've gone.",
    "Please don't touch the photo. It's… personal.",
    "That photo has been through a lot. So have the people in it.",
    "I'm keeping that one in a drawer from now on.",
  ],
  files: [
    "Those were filed. They're… differently filed now.",
    "That was the reorganised filing. It's re-reorganised now.",
    "I've asked HR to stop giving me paper.",
    "Leave them. Let them be free.",
  ],
  plant: [
    "It's fake. …It was real.",
    "That was the replacement plant. Rest in peace, Fern the First.",
    "I've stopped naming them.",
    "The garden centre has asked if we're okay.",
  ],
  floor: [
    "Take a seat. Or, yes, the floor is fine.",
    "The floor again. You two are really getting to know each other.",
    "I had the carpet replaced with something softer. For you, specifically.",
    "Stay down there if you like. It's a judgement-free floor.",
  ],
};

const VISIT = 4.95;
const DOOR = 0.5;

export const ONBOARDING: Script = {
  id: "onboarding",
  title: "Onboarding",
  steps: [
    { do: "walk", to: VISIT },
    { do: "say", text: "Welcome to Odd Jobs Ltd! We're not a company. We're a family." },
    { do: "say", text: "…Legally, we're a company.", aside: true },
    { do: "fidget", at: "mug", time: 1.0 },
    { do: "say", text: "Here we believe there's no such thing as a bad worker. Only bad fits." },
    { do: "say", text: "And unlimited second chances. I've taken the liberty of pre-approving all of them." },
    { do: "fidget", at: "nameplate", time: 0.8 },
    { do: "say", text: "Your first assignment is ringing a doorbell. I'm told it's entry level." },
    { do: "say", text: "I'm told it's THE entry level." },
    { do: "ifCalm", text: "…Huh. Nothing's broken. I'm writing that down." },
    { do: "say", text: "Off you go. Say hi to your mother." },
    { do: "walk", to: DOOR },
  ],
};

export const REVIEW_1: Script = {
  id: "review-1",
  title: "Performance Review #1",
  steps: [
    { do: "walk", to: VISIT },
    { do: "say", text: "Stanley! Sit, sit. Or stand. Standing's great. Standing is a choice." },
    { do: "say", text: "Good news! Every job on your sheet is marked complete." },
    { do: "fidget", at: "pens", time: 0.9 },
    { do: "say", text: "Client feedback. Mrs. Henderson confirms her doorbell was 'definitely rung.' She'd like to know where it is now." },
    { do: "say", text: "The Okafors say their laundry is 'mostly in the basket.' They've asked about the rest of the bedroom." },
    { do: "fidget", at: "files", time: 0.9 },
    { do: "say", text: "Mr. Patel has asked us not to send 'the energetic one' again. I've chosen to read that as a compliment about your energy." },
    { do: "say", text: "And 4B got their pizza. Their feedback form just says 'why' forty times. That's what we call engagement." },
    { do: "say", text: "Honestly? The suburbs were never a good fit for you. Too many… surfaces." },
    { do: "fidget", at: "nameplate", time: 0.8 },
    { do: "say", text: "The Docks are wide open. Big, sturdy, nautical. You're going to thrive." },
    { do: "ifCalm", text: "No casualties? I need to sit down. I am sitting down. I need to sit down more." },
    { do: "say", text: "Give your mother my best." },
    { do: "walk", to: DOOR },
  ],
};

export const REVIEW_2: Script = {
  id: "review-2",
  title: "Performance Review #2",
  steps: [
    { do: "walk", to: VISIT },
    { do: "say", text: "Stanley. Come in. Mind the… yes. That's fine. Come in." },
    { do: "say", text: "The Docks! Every crate reached its destination. Several of them reached several destinations." },
    { do: "fidget", at: "mug", time: 0.9 },
    { do: "say", text: "The fishmonger says he's never seen fish fly like that. He'd like to know if they were alive when they left." },
    { do: "say", text: "The harbourmaster used the word 'unprecedented' in an email. I've asked HR to frame it." },
    { do: "say", text: "And the ship's bell has been rung. Our lawyers confirm the ship was still technically in the water when you left, which counts." },
    { do: "fidget", at: "files", time: 0.9 },
    { do: "say", text: "We received more feedback this quarter than every previous quarter combined. That's what we in the business call growth." },
    { do: "say", text: "Honestly? The Docks were just too nautical for someone with your gifts." },
    { do: "say", text: "Downtown. That's where the professionals are. Wear a tie." },
    { do: "fidget", at: "pens", time: 0.8 },
    { do: "say", text: "…No tie. Ties are a grabbing hazard.", aside: true },
    { do: "ifCalm", text: "Not a scratch on the office. I'm going to have that framed. The office, I mean." },
    { do: "say", text: "Tell your mother I said hi. She'll know why." },
    { do: "walk", to: DOOR },
  ],
};

export const SCRIPTS: Record<string, Script> = {
  [ONBOARDING.id]: ONBOARDING,
  [REVIEW_1.id]: REVIEW_1,
  [REVIEW_2.id]: REVIEW_2,
};
