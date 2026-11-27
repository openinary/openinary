import assert from "node:assert/strict";
import { test } from "node:test";

import { onboardingSteps } from "../src/onboarding/steps";

test("each path gets its own steps", () => {
  const solo = { team: false, joining: false, plans: true };
  const team = { team: true, joining: false, plans: true };
  assert.deepEqual(onboardingSteps("cloud", solo), ["who", "profile", "use_cases", "source", "plan"]);
  assert.deepEqual(onboardingSteps("cloud", team), ["who", "profile", "use_cases", "source", "plan", "invite"]);
  // Already on a paid plan: nothing to pick.
  assert.deepEqual(onboardingSteps("cloud", { ...team, plans: false }), [
    "who",
    "profile",
    "use_cases",
    "source",
    "invite",
  ]);
  // A team staying on Free has nobody to invite.
  assert.deepEqual(onboardingSteps("cloud", { ...team, canInvite: false }), [
    "who",
    "profile",
    "use_cases",
    "source",
    "plan",
  ]);
  assert.deepEqual(onboardingSteps("self-hosted", { ...team, canInvite: false }), [
    "who",
    "profile",
    "use_cases",
    "source",
    "team_access",
  ]);
  assert.deepEqual(onboardingSteps("self-hosted", solo), ["who", "profile", "use_cases", "source"]);
  assert.deepEqual(onboardingSteps("self-hosted", team), ["who", "profile", "use_cases", "source", "team_access"]);
  for (const variant of ["cloud", "self-hosted"] as const) {
    assert.deepEqual(onboardingSteps(variant, { ...team, joining: true }), ["profile", "use_cases", "source"]);
  }
});
