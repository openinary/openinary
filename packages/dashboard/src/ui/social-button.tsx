"use client";

import { KeyRound, Loader2 } from "lucide-react";

import { Button } from "./button";

/**
 * The signed-out pages' single sign-on pieces, shared by self-hosted and
 * Cloud. Presentational only: each app owns its auth client, so the click
 * handler comes in from the caller.
 */

/** Google's "G", in its own four colours. */
export const GOOGLE_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

/** GitHub's Octicon mark; currentColor so it follows the button's text. */
export const GITHUB_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" aria-hidden="true">
    <path
      fill="currentColor"
      d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
    />
  </svg>
);

/** Microsoft's four squares. */
export const MICROSOFT_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#F25022" d="M2 2h9.5v9.5H2z" />
    <path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z" />
    <path fill="#00A4EF" d="M2 12.5h9.5V22H2z" />
    <path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z" />
  </svg>
);

/**
 * The mark for a provider type. Brands with a mark everyone knows get it;
 * the rest (Okta, Keycloak, a company's own OIDC server...) get a key, which
 * reads as "single sign-on" without pretending to be their logo.
 */
export function providerIcon(type: string): React.ReactNode {
  switch (type) {
    case "google":
      return GOOGLE_ICON;
    case "github":
      return GITHUB_ICON;
    case "microsoft":
      return MICROSOFT_ICON;
    default:
      return <KeyRound />;
  }
}

/**
 * Pill straddling the top-right edge of the method the visitor used last:
 * a sign-in button or the email field, both white, so it stays white too.
 */
export function LastUsedBadge({
  show,
  children,
}: {
  show: boolean;
  children: React.ReactNode;
}) {
  if (!show) return children;
  return (
    <div className="relative">
      {children}
      <span className="-translate-y-1/2 pointer-events-none absolute top-0 right-3 z-10 rounded-full border border-ds-border bg-white px-1.5 font-medium text-[10px]/4 text-ds-muted shadow-xs">
        Last used
      </span>
    </div>
  );
}

/** One "Login with <provider>" button: outline, full width, spinner once clicked. */
export function SocialButton({
  icon,
  label,
  loading = false,
  disabled = false,
  lastUsed = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  loading?: boolean;
  disabled?: boolean;
  lastUsed?: boolean;
  onClick: () => void;
}) {
  return (
    <LastUsedBadge show={lastUsed}>
      <Button
        variant="outline"
        type="button"
        className="w-full"
        disabled={loading || disabled}
        onClick={onClick}
      >
        {loading ? (
          <Loader2 className="animate-spin" aria-label="Loading" />
        ) : (
          <>
            {icon}
            {label}
          </>
        )}
      </Button>
    </LastUsedBadge>
  );
}

/** "or", on a hairline: between the sign-in buttons and the form. */
export function AuthSeparator() {
  return (
    <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-border after:border-t">
      <span className="relative z-10 bg-ds-panel px-2 text-ds-faint text-xs">
        or
      </span>
    </div>
  );
}
