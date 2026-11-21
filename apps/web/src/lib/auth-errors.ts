/**
 * Sign-in errors as sentences. The server sends a code as JSON `code`, or as
 * `?error=` on the page an OAuth callback sends the browser back to; Better
 * Auth lowercases and underscores some of them on the way, so codes are
 * compared in one shape: SCREAMING_SNAKE.
 */
const MESSAGES: Record<string, string> = {
  DOMAIN_NOT_ALLOWED:
    "Your email domain isn't allowed on this instance. Sign in with your work account, or ask an admin.",
  EMAIL_NOT_VERIFIED:
    "Your identity provider didn't confirm your email address belongs to an allowed organisation.",
  ACCESS_REVOKED:
    "Your account no longer has access to this instance. Ask an admin if that's a mistake.",
  BANNED_USER:
    "Your account has been suspended on this instance. Ask an admin to restore it.",
  SIGN_UP_CLOSED:
    "You don't have an account here yet. Ask an admin to add you, or sign in with single sign-on.",
  SIGNUP_DISABLED:
    "You don't have an account here yet, and this sign-in method can't create one. Ask an admin to add you.",
  PASSWORD_LOGIN_DISABLED:
    "Password sign-in is turned off on this instance. Use single sign-on.",
  FORBIDDEN_ROLE: "Your role can't do that.",
  ACCOUNT_NOT_LINKED:
    "An account with this email already exists, signed in another way. Use the method you signed up with.",
  UNABLE_TO_GET_USER_INFO:
    "Your identity provider didn't share your profile. Try again, or ask an admin to check the provider's settings.",
  EMAIL_NOT_FOUND:
    "Your identity provider didn't share an email address, which this instance needs.",
  INVALID_EMAIL_OR_PASSWORD: "Incorrect email or password",
  STATE_MISMATCH: "The sign-in took too long or was opened in another tab. Try again.",
  PLEASE_RESTART_THE_PROCESS: "The sign-in took too long or was opened in another tab. Try again.",
  INVALID_CODE: "The sign-in took too long or was opened in another tab. Try again.",
};

/**
 * The same codes, said to an admin acting on someone else's account (the
 * Users page): the person reading isn't the one being refused. Codes missing
 * here fall back to the sign-in sentences above.
 */
const ADMIN_MESSAGES: Record<string, string> = {
  DOMAIN_NOT_ALLOWED:
    "That email's domain isn't allowed on this instance (AUTH_ALLOWED_EMAIL_DOMAINS).",
  USER_ALREADY_EXISTS: "Someone with that email already has an account here.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
    "Someone with that email already has an account here.",
  USER_NOT_FOUND: "That account no longer exists. Refresh the list.",
  INVALID_EMAIL: "That doesn't look like an email address.",
  PASSWORD_TOO_SHORT: "That password is too short.",
  PASSWORD_TOO_LONG: "That password is too long.",
  CANNOT_CHANGE_OWN_ROLE:
    "You can't change your own role. Another admin can change it for you.",
  YOU_CANNOT_BAN_YOURSELF: "You can't suspend yourself.",
  YOU_CANNOT_REMOVE_YOURSELF: "You can't remove yourself.",
  YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE: "That role doesn't exist.",
  FORBIDDEN: "Only admins can manage users.",
  FORBIDDEN_ROLE: "Only admins can manage users.",
};

const normalize = (code: string) => code.trim().toUpperCase().replace(/[\s-]+/g, "_");

export interface AuthErrorOptions {
  /** "admin": an admin managing other people's accounts, not signing in. */
  context?: "sign-in" | "admin";
}

/** The sentence for `code`, or null when it's one we don't know. */
export function authErrorMessage(
  code: string | null | undefined,
  { context = "sign-in" }: AuthErrorOptions = {},
): string | null {
  if (!code) return null;
  const key = normalize(code);
  if (context === "admin") {
    const admin =
      ADMIN_MESSAGES[key] ??
      // Better Auth's admin plugin refuses non-admins with one code per route.
      (key.startsWith("YOU_ARE_NOT_ALLOWED_TO_") ? ADMIN_MESSAGES.FORBIDDEN : undefined);
    if (admin) return admin;
  }
  return MESSAGES[key] ?? null;
}

/**
 * What to show for an error the auth client handed back: our sentence for its
 * code when there is one, else the server's own message, else `fallback`.
 */
export function describeAuthError(
  error: { code?: string; message?: string } | null | undefined,
  fallback: string,
  options?: AuthErrorOptions,
): string {
  return authErrorMessage(error?.code, options) ?? (error?.message || fallback);
}

/** For `?error=` on the sign-in page: unknown codes still get a sentence. */
export function callbackErrorMessage(code: string): string {
  return (
    authErrorMessage(code) ??
    "Single sign-on didn't complete. Try again, or ask an admin if it keeps happening."
  );
}
