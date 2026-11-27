export type OnboardingVariant = "cloud" | "self-hosted";

/**
 * The steps, by name. Which ones a person sees depends on the product, on
 * whether they set up for themselves or a team, and on whether they are
 * joining a workspace someone else runs (see onboardingSteps).
 */
export type OnboardingStepId =
  | "who"
  | "profile"
  | "use_cases"
  | "source"
  | "plan"
  | "invite"
  | "team_access";

/** The steps a person sees, in order. */
export function onboardingSteps(
  variant: OnboardingVariant,
  {
    team,
    joining,
    plans,
    canInvite = true,
  }: {
    team: boolean;
    joining: boolean;
    plans: boolean;
    /**
     * Cloud: the plan has a seat to spare. A team that stays on Free (one
     * seat) has nobody to invite, so the plan step is its last.
     */
    canInvite?: boolean;
  },
): OnboardingStepId[] {
  if (joining) return ["profile", "use_cases", "source"];
  const steps: OnboardingStepId[] = ["who", "profile", "use_cases", "source"];
  if (variant === "cloud" && plans) steps.push("plan");
  if (team && variant === "self-hosted") steps.push("team_access");
  if (team && variant === "cloud" && canInvite) steps.push("invite");
  return steps;
}
