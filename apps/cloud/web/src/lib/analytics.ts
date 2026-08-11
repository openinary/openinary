import posthog from "posthog-js";

/**
 * Onboarding events, all client-side - posthog-js is already initialised in
 * instrumentation-client.ts and identified in app-shell.tsx, so these land
 * under the same user id as the server's cloud_account_created /
 * asset_uploaded (see apps/server/api/lib/analytics.ts) and the funnel reads
 * end to end.
 *
 * Engagement is defined as >= 3 playgroundTransformApplied, or 1
 * playgroundUrlCopied. Target funnel:
 *   cloud_account_created -> asset_uploaded -> playground_transform_applied
 *   -> playground_url_copied -> cdn_requests > 0
 *
 * Named functions rather than one capture(name, props): the property shape
 * differs per event and this is what keeps a typo from silently creating a
 * second event in PostHog.
 */

export type PlaygroundSurface = "images" | "videos";
/** Whether the user was playing with our demo media or their own file. */
export type PlaygroundAssetKind = "demo" | "own";
export type IntegrationVariant = "ai" | "nextjs" | "react";

export function trackPlaygroundOpened(surface: PlaygroundSurface) {
  posthog.capture("playground_opened", { surface });
}

export function trackPlaygroundTransformApplied(props: {
  surface: PlaygroundSurface;
  op: string;
  value: string;
  asset: PlaygroundAssetKind;
}) {
  posthog.capture("playground_transform_applied", props);
}

export function trackPlaygroundUrlCopied(props: {
  surface: PlaygroundSurface;
  op: string;
  asset: PlaygroundAssetKind;
}) {
  posthog.capture("playground_url_copied", props);
}

export function trackIntegrationPromptCopied(variant: IntegrationVariant) {
  posthog.capture("integration_prompt_copied", { variant });
}

/**
 * The framework guides live in the docs, so their variant can no longer show
 * up on integration_prompt_copied. This keeps the same question answerable -
 * which integration route a user takes - now that two of the three leave.
 */
export function trackIntegrationDocsOpened(variant: "nextjs" | "react") {
  posthog.capture("integration_docs_opened", { variant });
}

export function trackOnboardingStepCompleted(step: string) {
  posthog.capture("onboarding_step_completed", { step });
}
