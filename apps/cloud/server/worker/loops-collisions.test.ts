// Run with: npx tsx worker/loops-collisions.test.ts
//
// Eight workflows run against the same person at once, and nothing in Loops
// knows that. Each one reads well on its own; what nobody can see by reading
// them is that the introduction's third email and the win-back's first used to
// land the same morning, both asking whether they were still there.
//
// So this replays every sequence in api/scripts/loops-sequences.ts day by day
// against a handful of accounts and asserts what the reader would notice: two
// emails in one day, a beginner's nudge sent to somebody who already paid, the
// same pitch twice. A delay moved by three days can reintroduce any of them
// without touching a line of copy, which is exactly the kind of change that
// gets reviewed as harmless.
//
// The thresholds come from lib/lifecycle.ts rather than being written out
// again, so moving INACTIVE_DAYS re-times the win-back here too and the clash
// it causes shows up as a failure rather than as a send.

import assert from "node:assert/strict";
import { APPROACHING_LIMIT, INACTIVE_DAYS } from "../api/lib/lifecycle.js";
import {
  type Filter,
  SEQUENCES,
  type Sequence,
} from "../api/scripts/loops-sequences.js";

const HORIZON = 60;

/** The contact properties every audience filter in the sequences reads. */
type Props = {
  plan: string;
  storageMb: number;
  apiKeyCount: number;
  transformCount: number;
  usagePercent: number;
};

type Persona = {
  label: string;
  props: (day: number) => Props;
  /** Last day they signed in; the win-back clock counts from here. */
  lastActiveDay: number;
  /** Loops can see opens, not replies, so this is the only engagement signal. */
  opens: boolean;
};

type Send = { day: number; workflow: string; subject: string };

const DAYS: Record<string, number> = { m: 1 / 1440, h: 1 / 24, d: 1 };

function matches(filter: Filter, props: Props, opens: boolean): boolean {
  const results = filter.conditions.map((condition) => {
    if (condition.type === "activity")
      return condition.negate ? !opens : opens;
    const actual = (props as unknown as Record<string, unknown>)[condition.key];
    switch (condition.operator) {
      case "equals":
        return actual === condition.value;
      case "notEquals":
        return actual !== condition.value;
      case "greaterThan":
        return Number(actual) > Number(condition.value);
      case "lessThan":
        return Number(actual) < Number(condition.value);
      default:
        throw new Error(`unhandled filter operator ${condition.operator}`);
    }
  });
  return filter.match === "all"
    ? results.every(Boolean)
    : results.some(Boolean);
}

/**
 * One walk through a sequence, entered on `start`.
 *
 * A filter is a gate: failing one ends the walk rather than skipping a step.
 * That is Loops' own behaviour and the reason the three activation nudges are
 * three workflows - see the note in loops-sequences.ts before changing it here.
 */
function walk(sequence: Sequence, start: number, persona: Persona): Send[] {
  const sends: Send[] = [];
  let day = start;
  for (const step of sequence.steps) {
    if ("wait" in step) {
      day += step.wait.amount * (DAYS[step.wait.unit] ?? 0);
      continue;
    }
    if ("filter" in step) {
      if (!matches(step.filter, persona.props(day), persona.opens)) break;
      continue;
    }
    sends.push({ day, workflow: sequence.name, subject: step.email.subject });
  }
  return sends;
}

/**
 * The days a sequence is entered. Event days are derived from the same rules
 * the daily sync applies in lib/loops.ts, so the two cannot drift apart.
 */
function entryDays(sequence: Sequence, persona: Persona): number[] {
  if (sequence.trigger.type === "signup") return [0];

  if (sequence.trigger.type === "event") {
    const days: number[] = [];
    for (let day = 0; day <= HORIZON; day++) {
      const props = persona.props(day);
      if (
        sequence.trigger.eventName === "cloud_inactive" &&
        day === persona.lastActiveDay + INACTIVE_DAYS
      )
        days.push(day);
      // Fired every day it holds, not only on the crossing - see lib/loops.ts.
      if (
        sequence.trigger.eventName === "cloud_approaching_limit" &&
        props.plan === "free" &&
        props.usagePercent >= APPROACHING_LIMIT * 100
      )
        days.push(day);
    }
    return sequence.reEligible ? days : days.slice(0, 1);
  }

  // A contact property changing, which only the daily sync can observe.
  const days: number[] = [];
  for (let day = 1; day <= HORIZON; day++)
    if (
      persona.props(day - 1).plan === sequence.trigger.was.value &&
      persona.props(day).plan === sequence.trigger.is.value
    )
      days.push(day);
  return sequence.reEligible ? days : days.slice(0, 1);
}

function inbox(persona: Persona): Send[] {
  const sends: Send[] = [];
  for (const sequence of SEQUENCES)
    for (const start of entryDays(sequence, persona))
      sends.push(...walk(sequence, start, persona));
  return sends.sort((a, b) => a.day - b.day);
}

const free = (over: Partial<Props> = {}): Props => ({
  plan: "free",
  storageMb: 0,
  apiKeyCount: 0,
  transformCount: 0,
  usagePercent: 0,
  ...over,
});

// Signs up out of curiosity and never comes back. The commonest account there
// is, and the one every sequence can reach at once.
const ghost: Persona = {
  label: "ghost",
  props: () => free(),
  lastActiveDay: 0,
  opens: false,
};

// Uploads through the dashboard, wires the URLs into a live site, never signs
// in again. Looks inactive to the session table and busy to the CDN, which is
// how "Did we lose you?" and "You are at 88%" used to arrive together.
const headless: Persona = {
  label: "headless shipper",
  props: (day) =>
    free({ storageMb: 120, usagePercent: day < 20 ? 40 : 88 }),
  lastActiveDay: 0,
  opens: false,
};

// Both clocks crossing on the same day, which is the worst case rather than an
// unlikely one: neither threshold knows about the other.
const collider: Persona = {
  label: "collider",
  props: (day) =>
    free({ storageMb: 120, usagePercent: day < INACTIVE_DAYS ? 50 : 88 }),
  lastActiveDay: 0,
  opens: false,
};

// Buys on day 5; the daily sync writes the new plan on day 6. Every onboarding
// sequence is still mid-flight when it does.
const buyer: Persona = {
  label: "early buyer",
  props: (day) =>
    free({ plan: day >= 6 ? "early_access" : "free", storageMb: 300 }),
  lastActiveDay: 0,
  opens: false,
};

// Reads the emails and uses the product. The control: the sequences should be
// quietest for the person who needs them least.
const engaged: Persona = {
  label: "engaged",
  props: () =>
    free({ storageMb: 400, apiKeyCount: 2, transformCount: 300, usagePercent: 45 }),
  lastActiveDay: 0,
  opens: true,
};

const personas = [ghost, headless, collider, buyer, engaged];

// --- one email a day, at most ----------------------------------------------
//
// The rule that catches the whole class. Two lifecycle emails in one morning
// reads as broken automation however good each one is, and it is never visible
// from inside a single sequence.
for (const persona of personas) {
  const sends = inbox(persona);
  const byDay = new Map<number, Send[]>();
  for (const send of sends)
    byDay.set(send.day, [...(byDay.get(send.day) ?? []), send]);

  for (const [day, group] of byDay)
    assert.equal(
      group.length,
      1,
      `${persona.label}: ${group.length} emails on day ${day} - ${group
        .map((s) => `${s.workflow} "${s.subject}"`)
        .join(" + ")}`,
    );
}

// --- who must never hear from a sequence -----------------------------------

// Nobody is told they have files by an account that has none. This one is a
// false statement, not just bad timing: the email opens with "You have files in
// Openinary" eleven days after we told them their bucket was empty.
assert.ok(
  !inbox(ghost).some((send) => send.workflow.includes("first transformation")),
  "an empty account was sent the transformation nudge",
);

// A customer who pays and whose setup runs without them is not churning, and
// "Should I stop emailing you?" is a strange thing to send someone's who money
// you are taking.
assert.ok(
  !inbox(buyer).some((send) => send.workflow.includes("Win-back")),
  "a paying customer was sent the win-back sequence",
);

// Nor is an account serving 80% of its allowance on the day the win-back gate
// asks. Deliberately the collider and not the headless shipper: the latter is
// still at 40% on day 14, so it does look dormant then and the sequence is
// right to run - the claim being made here is about usage at the moment of the
// gate, not about ever having been busy.
assert.ok(
  !inbox(collider).some((send) => send.workflow.includes("Win-back")),
  "an account at 88% of its limits was told it had gone quiet",
);

// Onboarding stops at the sale. Otherwise the beginner's nudges keep arriving
// alongside the paid welcome, from a product that evidently has not noticed.
assert.ok(
  !inbox(buyer).some((send) => send.workflow.includes("Activation")),
  "an activation nudge was sent after the upgrade",
);

// --- the same pitch twice ---------------------------------------------------
//
// "Upgrade invite" and "Approaching free limit" open with the same bullet list
// (2 GB, 1,000 transformations, 30 minutes of video, 50,000 requests) and the
// same button to the same URL. Whichever fits the account should run; both is a
// duplicate send, and it used to happen a day apart.
for (const persona of personas) {
  const pitches = new Set(
    inbox(persona)
      .filter(
        (send) =>
          send.workflow.includes("Upgrade invite") ||
          send.workflow.includes("Approaching free limit"),
      )
      .map((send) => send.workflow),
  );
  assert.ok(
    pitches.size <= 1,
    `${persona.label}: got both upgrade sequences - ${[...pitches].join(" + ")}`,
  );
}

// --- volume -----------------------------------------------------------------
//
// A ceiling rather than a target. Nothing enforces one inside Loops, and eight
// sequences that each look restrained still add up.
for (const persona of personas) {
  const sends = inbox(persona);
  assert.ok(
    sends.length <= 10,
    `${persona.label}: ${sends.length} emails in ${HORIZON} days`,
  );
  const week = (from: number) =>
    sends.filter((s) => s.day >= from && s.day < from + 7).length;
  const busiest = Math.max(0, ...sends.map((s) => week(s.day)));
  assert.ok(busiest <= 4, `${persona.label}: ${busiest} emails in one week`);
}

console.log("loops-collisions.test.ts: ok");
