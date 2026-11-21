"use client";

import { providerIcon, SocialButton } from "@openinary/dashboard/ui/social-button";
import { useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { describeAuthError } from "@/lib/auth-errors";
import type { AuthOptions } from "@/lib/validate-auth-config";

// The method this browser signed in with last, for the "Last used" pill. Only
// a convenience: storage can be off, and then no pill.
const LAST_METHOD_KEY = "openinary:last-login-method";
// The provider clicked, until the sign-in is known to have worked: an IdP
// that refuses comes back with ?error=, and that one shouldn't get the pill.
// Per tab, so a sign-in abandoned in one doesn't count in another.
const PENDING_METHOD_KEY = "openinary:pending-login-method";

export function rememberLoginMethod(method: string) {
  try {
    localStorage.setItem(LAST_METHOD_KEY, method);
  } catch {}
}

/** Before the redirect to the IdP; made "last used" once signed in. */
function rememberPendingLoginMethod(method: string) {
  try {
    sessionStorage.setItem(PENDING_METHOD_KEY, method);
  } catch {}
}

/** The sign-in came back with an error, or never left: forget the click. */
export function forgetPendingLoginMethod() {
  try {
    sessionStorage.removeItem(PENDING_METHOD_KEY);
  } catch {}
}

/** Signed in: the provider clicked on the way here becomes "last used". */
export function confirmPendingLoginMethod() {
  try {
    const method = sessionStorage.getItem(PENDING_METHOD_KEY);
    if (!method) return;
    sessionStorage.removeItem(PENDING_METHOD_KEY);
    rememberLoginMethod(method);
  } catch {}
}

export function useLastLoginMethod() {
  const [method, setMethod] = useState<string | null>(null);
  useEffect(() => {
    try {
      setMethod(localStorage.getItem(LAST_METHOD_KEY));
    } catch {}
  }, []);
  return method;
}

/**
 * One "Login with <name>" button per configured provider. Generic OIDC
 * providers register as social providers in Better Auth 1.7, so every one of
 * them signs in the same way. A failed callback comes back to `returnTo`
 * with `?error=<code>`, which that page turns into a sentence.
 */
export function SsoButtons({
  providers,
  returnTo,
  lastMethod,
  disabled,
  onError,
}: {
  providers: AuthOptions["providers"];
  /** The page a failed sign-in comes back to: "/login" or "/setup". */
  returnTo: string;
  lastMethod?: string | null;
  disabled?: boolean;
  onError: (message: string) => void;
}) {
  const [pending, setPending] = useState<string | null>(null);
  if (providers.length === 0) return null;

  return (
    <div className="grid gap-3">
      {providers.map((provider) => (
        <SocialButton
          key={provider.id}
          icon={providerIcon(provider.type)}
          label={`Login with ${provider.name}`}
          loading={pending === provider.id}
          disabled={disabled || (!!pending && pending !== provider.id)}
          lastUsed={lastMethod === provider.id}
          onClick={() => {
            setPending(provider.id);
            rememberPendingLoginMethod(provider.id);
            const origin = window.location.origin;
            void authClient.signIn.social(
              {
                provider: provider.id,
                callbackURL: `${origin}/`,
                errorCallbackURL: `${origin}${returnTo}`,
              },
              {
                // Only errors before the redirect land here (an unknown
                // provider, the server down); the IdP's come back as ?error=.
                onError: ({ error }) => {
                  forgetPendingLoginMethod();
                  onError(describeAuthError(error, "Couldn't start single sign-on"));
                  setPending(null);
                },
              },
            );
          }}
        />
      ))}
    </div>
  );
}
