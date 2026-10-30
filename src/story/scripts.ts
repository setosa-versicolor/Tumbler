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

/** Gerald ends every meeting the same way. Every single one. */
export const SIGN_OFF = "Say hi to your mother.";

/**
 * Gerald's reactions to whatever Stanley knocks over, in order. Each time an
 * object comes to grief (across every cutscene, not just this one) he moves
 * on to the next line, so jokes don't repeat, and later lines call back to
 * earlier ones. A few double as clues; some are just a pointed sip of
 * coffee. After the last line he starts over.
 */
export const BARKS: Record<Incident, string[]> = {
  cooler: [
    "Oh, sure. Just push it over if it's in your way.",
    "Did the water cooler say something mean to you?",
    "Ummm, we really do prefer for the water cooler to be upright…",
    "I had the cooler bolted down. …I see the bolts were optional.",
    "Facilities has stopped asking. They just send a mop now.",
    "*Loud, disappointed sip.*",
    "We're getting a water fountain. You can't knock over a fountain. Please don't prove me wrong.",
    "That's a brand-new cooler. It came with a little helmet. For it.",
    "The cooler's union rep would like a meeting.",
    "Every time you visit, the cooler and I share a look. This time it saw you coming.",
    "I've started bringing a canteen.",
    "Accounting has a line item now. It just says 'Stanley: hydration.'",
    "*Sips from a canteen. Maintains eye contact.*",
    "You know, I think it lies down because it's tired. Let's go with that.",
  ],
  mug: [
    "That's fine. I have a spare mug.",
    "That was the spare mug.",
    "I buy mugs in bulk now. The supplier sent us a thank-you card.",
    "This one's plastic. …And it bounces. Good to know.",
    "I'll just drink from the pot.",
    "*Sips directly from the coffee pot. It's still hot. He doesn't flinch.*",
    "I'm drinking straight from a thermos now. It lives in the drawer. Locked.",
    "Someone left a mug on my desk that just says 'BRACE.' I suspect HR.",
    "That one said 'World's Okayest Boss.' It was being generous, and now it's on the floor.",
    "I've started holding my coffee for the whole meeting. As you can see.",
    "The mug is fine. The mug is a survivor. The coffee is not.",
    "I'll add it to the jar. It's a jar of mug pieces. It has your name on it.",
    "Every mug on this desk has a little tally on the bottom now.",
  ],
  pens: [
    "Those were the good pens. Were.",
    "Those were the replacement good pens.",
    "I've switched to pencils. You can't spill a pencil. …Apparently you can.",
    "I'll sign things with my finger from now on.",
    "*Long sip. Writes something down with a crayon.*",
    "I'm taking notes with a crayon now. A big, safe crayon.",
    "The pen cup has a tiny seatbelt now. It didn't help.",
    "Those pens had my initials on them. Well. Our initials.",
    "Leave them. They'll find their way home.",
    "I bought those pens specially for this meeting. That was optimistic.",
    "The stationery cupboard now sends its invoices directly to you.",
    "Let's just say this meeting is pen-optional.",
    "Next time I'm memorising everything.",
  ],
  nameplate: [
    "Leave it. It's a nameplate. Everyone knows who I am.",
    "Leave it, leave it. It's only got my name on it.",
    "I'm having that glued down. Facing the right way, for once.",
    "You know what, it's safer face-down.",
    "*Sips. Doesn't look. Doesn't need to.*",
    "That nameplate spends more time on its back than I do on holiday.",
    "I've ordered a nameplate that's just a sphere. No front, no back. No falling.",
    "Some days I think that nameplate is trying to tell you something.",
    "That's the fourth nameplate this year. The engraver asks after you.",
    "It's fine. If anyone forgets who I am, I'll remind them.",
    "Funny, it always lands with my name facing away from you.",
    "Leave it there. It's resting.",
    "One day you'll read it. Not today.",
  ],
  photo: [
    "Don't— I'll get that. Later. When you've gone.",
    "Please don't touch the photo. It's… personal.",
    "That photo has been through a lot. So have the people in it.",
    "I'm keeping that one in a drawer from now on.",
    "*Very quiet sip.*",
    "Not the photo. Anything but the photo. …Well, also the mug.",
    "There's a reason that photo faces my way, Stanley.",
    "That was taken at a very happy time. Before you could walk.",
    "The frame's made of rubber now. Don't ask how I knew to do that.",
    "Please. That's a family heirloom. It's of a family.",
    "I'll tell you about that photo one day. Today is not that day.",
    "It's a picture of some people I'm very fond of. Generally.",
    "Let it lie face-down. It's seen enough.",
  ],
  files: [
    "Those were filed. They're… differently filed now.",
    "That was the reorganised filing. It's re-reorganised now.",
    "I've asked HR to stop giving me paper.",
    "Leave them. Let them be free.",
    "*Sips. Looks at the files. Sips again.*",
    "Those were your files, actually. Very thick. You'll be relieved.",
    "If anyone asks, that's our new filing system: 'scatter.'",
    "The shredder's going to be so jealous.",
    "Some of those were complaints. Now they're mulch.",
    "Leave them. Paperwork is temporary. Floors are forever.",
    "That's fine, everything's backed up. On paper. In those.",
    "Legal says if the files are on the floor, they technically never reached my desk. So, thank you.",
    "I'm going to call that 'archiving.'",
  ],
  plant: [
    "It's fake. …It was real.",
    "That was the replacement plant. Rest in peace, Fern the First.",
    "I've stopped naming them.",
    "The garden centre has asked if we're okay.",
    "*A respectful sip, in memory of the plant.*",
    "We're down to cacti now. Mostly hug-resistant.",
    "That was a plastic plant. You broke a plastic plant. I'm honestly impressed.",
    "The plants have started leaning away from the door when you come in.",
    "There's a little memorial garden by the lifts. Most of it came from this office.",
    "Fern the Fourth had a good run. About eleven minutes.",
    "Don't worry. It's mostly soil. And regret.",
    "Next we're getting a painting of a plant. Please don't test that.",
    "It'll grow back. Everything grows back. Except the budget.",
  ],
  floor: [
    "Take a seat. Or, yes, the floor is fine.",
    "The floor again. You two are really getting to know each other.",
    "I had the carpet replaced with something softer. For you, specifically.",
    "Stay down there if you like. It's a judgement-free floor.",
    "*Sips, looking down at you, for slightly too long.*",
    "Ah, there you are. Down there.",
    "Facilities wanted to put a mat there. I said, 'No, let him have his spot.'",
    "You fall with such commitment. That's a transferable skill.",
    "I'll just talk to the top of your head, then. Lovely hair.",
    "Gravity's given you a glowing review this quarter.",
    "*Sip.* …*Sip.*",
    "Every time you hit the floor, the people downstairs send up flowers. Sympathy flowers.",
    "Take your time. The floor's not going anywhere. That's what I like about it.",
    "Honestly, you're at your most consistent down there.",
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
    { do: "say", text: "Off you go." },
    { do: "say", text: SIGN_OFF },
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
    { do: "say", text: SIGN_OFF },
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
    { do: "say", text: "*Long, thoughtful sip.*", aside: true },
    { do: "say", text: "Honestly? The Docks were just too nautical for someone with your gifts." },
    { do: "say", text: "Downtown. That's where the professionals are. Wear a tie." },
    { do: "fidget", at: "pens", time: 0.8 },
    { do: "say", text: "…No tie. Ties are a grabbing hazard.", aside: true },
    { do: "ifCalm", text: "Not a scratch on the office. I'm going to have that framed. The office, I mean." },
    { do: "say", text: SIGN_OFF },
    { do: "walk", to: DOOR },
  ],
};

export const SCRIPTS: Record<string, Script> = {
  [ONBOARDING.id]: ONBOARDING,
  [REVIEW_1.id]: REVIEW_1,
  [REVIEW_2.id]: REVIEW_2,
};
