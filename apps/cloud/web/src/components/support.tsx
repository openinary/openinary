"use client";

import {
  IdentifySupportVisitor,
  Support,
  SupportProvider,
} from "@cossistant/next";
import { useQuery } from "@tanstack/react-query";

import { authClient } from "@/lib/auth-client";
import { FEATURES, formatUsd, usageCost } from "@/lib/usage";
import { orpc } from "@/utils/orpc";

// Read here rather than letting the SDK resolve it: Turbopack only substitutes
// NEXT_PUBLIC_* inside the app's own files, so in dev the SDK's runtime lookup
// (it lives in node_modules) sees nothing and boots into its "missing api key"
// state with the key sitting right there in .env. An explicit publicKey wins
// over that lookup and behaves the same in dev and in the production build.
const PUBLIC_KEY = process.env.NEXT_PUBLIC_COSSISTANT_API_KEY;

const iso = (value: number | Date | null | undefined) =>
  value ? new Date(value).toISOString() : null;

/**
 * Everything an agent would otherwise have to ask the customer for: who the
 * account is, how it signs in, what it pays, and how close it is to its
 * allowance. externalId is the same user id PostHog and the server's events
 * use, so a conversation can be traced straight to the account.
 *
 * Both queries are already in flight for this screen (the usage menu and the
 * bucket-scoped provider), so react-query serves them from cache - no extra
 * round-trip for the widget. Metadata holds primitives only, so the per-feature
 * balances are flattened into the same strings the usage menu shows, and the
 * SDK hashes it before sending: re-renders with unchanged values cost nothing.
 *
 * Note the SDK does not put this metadata in the identify call - it identifies
 * on name/email/image, then PATCHes the metadata separately once the contact
 * exists, so the first write can lag a page load behind.
 */
function IdentifyAccount() {
  const { data: session } = authClient.useSession();
  const { data: usage } = useQuery(orpc.usage.get.queryOptions());
  const { data: buckets } = useQuery(orpc.bucket.list.queryOptions());

  const user = session?.user;
  if (!user) return null;

  const consumption: Record<string, string | null> = Object.fromEntries(
    FEATURES.map((feature): [string, string | null] => {
      const balance = usage?.features[feature.id];
      if (!balance) return [feature.id, null];
      return [
        feature.id,
        balance.unlimited
          ? feature.format(balance.used)
          : `${feature.format(balance.used)} / ${feature.format(balance.granted)}`,
      ];
    }),
  );

  return (
    <IdentifySupportVisitor
      email={user.email}
      externalId={user.id}
      image={user.image ?? null}
      metadata={{
        plan: usage?.planName ?? usage?.planId ?? null,
        planId: usage?.planId ?? null,
        emailVerified: user.emailVerified,
        signedUpAt: iso(user.createdAt),
        lastLoginMethod: authClient.getLastUsedLoginMethod() ?? null,
        renewsAt: iso(usage?.renewsAt),
        cancelsAt: iso(usage?.cancelsAt),
        overage: usage ? formatUsd(usageCost(usage.features)) : null,
        ...consumption,
        buckets: buckets?.length ?? null,
        activeBucketId: buckets?.find((b) => b.active)?.id ?? null,
      }}
      name={user.name}
    />
  );
}

export function SupportWidget() {
  // With no key the SDK still renders the bubble and hides a configuration
  // error behind it. Local dev and any deploy that hasn't been given the key
  // get no widget instead.
  if (!PUBLIC_KEY) return null;

  return (
    <SupportProvider publicKey={PUBLIC_KEY}>
      <IdentifyAccount />
      {/* The widget's own root is `relative`: it does not place itself, so
          left unstyled it lands inline at the end of the page and stretches
          it. Pinning the root is all the positioning needed - the panel
          anchors to the trigger through floating-ui, and its defaults
          (side="top" align="end") already open it up and to the left.
          The default trigger is 56px with a 28px glyph; both shrink here. */}
      <Support
        className="fixed right-4 bottom-4 z-50"
        classNames={{ trigger: "size-9 [&_svg]:size-4" }}
      />
    </SupportProvider>
  );
}
