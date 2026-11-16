import type { DashboardAnalytics } from "@openinary/dashboard";
import posthog from "posthog-js";

/**
 * Onboarding events, all client-side - posthog-js is already initialised in
 * instrumentation-client.ts and identified in app-shell.tsx, so these land
 * under the same user id as the server's cloud_account_created /
 * asset_uploaded (see apps/cloud/server/worker/lib/analytics.ts) and the funnel reads
 * end to end.
 *
 * Engagement is defined as >= 3 playground_transform_applied, or 1
 * playground_url_copied. Target funnel:
 *   cloud_account_created -> asset_uploaded -> playground_transform_applied
 *   -> playground_url_copied -> cdn_requests > 0
 *
 * Named functions rather than one capture(name, props): the property shape
 * differs per event and this is what keeps a typo from silently creating a
 * second event in PostHog. The dashboard's events are typed by
 * @openinary/dashboard (DashboardAnalytics).
 */

export const dashboardAnalytics: DashboardAnalytics = {
  playgroundOpened: (surface) => {
    posthog.capture("playground_opened", { surface });
  },
  playgroundTransformApplied: (props) => {
    posthog.capture("playground_transform_applied", props);
  },
  playgroundUrlCopied: (props) => {
    posthog.capture("playground_url_copied", props);
  },
  integrationPromptCopied: (variant) => {
    posthog.capture("integration_prompt_copied", { variant });
  },
  // The framework guides live in the docs, so their variant can no longer
  // show up on integration_prompt_copied. This keeps the same question
  // answerable: which integration route a user takes.
  integrationDocsOpened: (variant) => {
    posthog.capture("integration_docs_opened", { variant });
  },
};

/** The questionnaire was put in front of the user (once per page load). */
export function trackOnboardingStarted() {
  posthog.capture("onboarding_started");
}

/**
 * One per questionnaire step left forwards, so answers are kept even for
 * users who never reach onboarding_completed, and drop-off reads per step.
 * `step` is the number funnels filter on; `step_name` is for humans.
 */
export function trackOnboardingStepCompleted(props: {
  step: 0 | 1 | 2 | 3;
  step_name: "profile" | "bucket" | "use_cases" | "source";
  skipped: boolean;
  role?: string;
  has_avatar?: boolean;
  bucket_renamed?: boolean;
  has_description?: boolean;
  use_cases?: string[];
  source?: string | null;
}) {
  posthog.capture("onboarding_step_completed", props);
}
