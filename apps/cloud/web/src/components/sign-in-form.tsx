"use client";

import { useTabTitle } from "@openinary/dashboard";
import { useForm } from "@tanstack/react-form";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import z from "zod";
import { useTurnstile } from "@/hooks/use-turnstile";
import { authClient } from "@/lib/auth-client";
import { Logo } from "./logo";
import { AuthSplit } from "@openinary/dashboard/ui/auth-split";
import { Button } from "@openinary/dashboard/ui/button";
import { Input } from "@openinary/dashboard/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "./ui/input-otp";
import { Label } from "@openinary/dashboard/ui/label";

const ONBOARDING_ROUTE = "/get-started";

/**
 * There is no separate sign-up route - the same email-code endpoint registers
 * a first-time visitor - so "did this just create an account?" is read off the
 * user it hands back: the row was written milliseconds ago, in the very
 * request whose response this is. Google and GitHub take the exact path instead
 * (newUserCallbackURL, decided server-side), so this only covers the code.
 *
 * A minute of slack absorbs clock skew; a returning account is days old, and
 * a skew large enough to make one look fresh would have to match its age.
 */
function isFreshAccount(createdAt: Date | string) {
  return Date.now() - new Date(createdAt).getTime() < 60_000;
}

// The last-used method lives in a cookie. The layout reads it on the server
// so the first paint already greets a returning visitor; the effect only
// catches a change made since that render.
function useLastLoginMethod(hint: string | null) {
  const [method, setMethod] = useState(hint);
  useEffect(() => {
    setMethod(authClient.getLastUsedLoginMethod());
  }, []);
  return method;
}

// Pill straddling the top-right edge of the method the visitor used last:
// the Google button or the email field, so it takes the card surface too.
function LastUsedBadge({
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
      <span className="-translate-y-1/2 pointer-events-none absolute top-0 right-3 z-10 rounded-full border border-ds-border bg-ds-card px-1.5 font-medium text-[10px]/4 text-ds-muted shadow-xs">
        Last used
      </span>
    </div>
  );
}

// GitHub's Octicon mark; currentColor so it follows the button's text.
const GITHUB_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" aria-hidden="true">
    <path
      fill="currentColor"
      d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
    />
  </svg>
);

export function SocialButton({
  provider,
  label,
  lastUsed,
}: {
  provider: "google" | "github";
  label: string;
  lastUsed?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const button = (
    <Button
      variant="outline"
      type="button"
      className="w-full"
      disabled={loading}
      onClick={() => {
        setLoading(true);
        authClient.signIn.social(
          // callbackURL is relative to the auth server (:3000); redirect back
          // to this web app's origin (:3001) instead.
          {
            provider,
            callbackURL: window.location.origin,
            // Only used when the callback actually created the account, so
            // returning users still land on their library.
            newUserCallbackURL: `${window.location.origin}${ONBOARDING_ROUTE}`,
          },
          {
            onError: (error) => {
              toast.error(error.error.message);
              setLoading(false);
            },
          },
        );
      }}
    >
      {loading ? (
        <Loader2 className="animate-spin" aria-label="Loading" />
      ) : provider === "github" ? (
        <>
          {GITHUB_ICON}
          {label}
        </>
      ) : (
        <>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
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
          {label}
        </>
      )}
    </Button>
  );
  return <LastUsedBadge show={!!lastUsed}>{button}</LastUsedBadge>;
}

export function AuthSeparator() {
  return (
    <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-border after:border-t">
      <span className="relative z-10 bg-ds-panel px-2 text-ds-faint text-xs">
        or
      </span>
    </div>
  );
}

export function AuthFooter() {
  return (
    <div className="text-pretty px-6 text-center text-ds-faint text-xs [&_a]:underline [&_a]:underline-offset-4 [&_a]:hover:text-ds-text">
      By continuing, you agree to our{" "}
      <a
        href="https://www.openinary.dev/terms"
        target="_blank"
        rel="noreferrer"
      >
        Terms of Service
      </a>{" "}
      and{" "}
      <a
        href="https://www.openinary.dev/privacy"
        target="_blank"
        rel="noreferrer"
      >
        Privacy Policy
      </a>
      .
    </div>
  );
}

export default function SignInForm({
  lastMethodHint = null,
}: {
  lastMethodHint?: string | null;
}) {
  const router = useRouter();
  const captcha = useTurnstile();
  const lastMethod = useLastLoginMethod(lastMethodHint);
  // The address the code went to. Empty = still on the email step; no valid
  // email is ever "", so it doubles as the step flag.
  const [sentTo, setSentTo] = useState("");
  useTabTitle(`${sentTo ? "Check your email" : "Sign in"} · Openinary Cloud`);

  // One form across both steps: same submit button, and the email is still
  // there when the code comes back. useForm re-applies these options on every
  // render, so the validator and handler always see the current step.
  const form = useForm({
    defaultValues: {
      email: "",
      otp: "",
    },
    onSubmit: async ({ value }) => {
      if (!sentTo) {
        const headers = await captcha.headers();
        if (!headers) {
          toast.error("Please complete the captcha");
          captcha.reset();
          return;
        }
        await authClient.emailOtp.sendVerificationOtp(
          {
            email: value.email,
            type: "sign-in",
          },
          {
            headers,
            // Succeeds even for an address with no account when sign-up is
            // closed: the server deliberately won't say which emails exist.
            onSuccess: () => {
              setSentTo(value.email);
            },
            onError: (error) => {
              toast.error(error.error.message);
              // Turnstile tokens are single-use - a retry needs a fresh one.
              captcha.reset();
            },
          },
        );
        return;
      }

      await authClient.signIn.emailOtp(
        {
          email: sentTo,
          otp: value.otp,
        },
        {
          // Signing in needs no redirect: useSession picks up the new session
          // and the "/" gate swaps this form for the dashboard. Signing *up*
          // does - a brand new account has nothing to show in the library.
          onSuccess: ({ data }) => {
            // Mid MCP OAuth flow, the server answers with where to go next
            // (the consent page, or straight back to the agent).
            const next = data as { redirect?: boolean; url?: string };
            if (next.redirect && next.url) {
              window.location.assign(next.url);
              return;
            }
            toast.success("Sign in successful");
            if (isFreshAccount(data.user.createdAt)) {
              router.push(ONBOARDING_ROUTE);
            }
          },
          onError: (error) => {
            toast.error(error.error.message);
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        email: z.email("Invalid email address"),
        // Only demanded once there is a code to type.
        otp: sentTo
          ? z.string().length(6, "Enter the 6-digit code")
          : z.string(),
      }),
    },
  });

  const backToEmail = () => {
    setSentTo("");
    form.setFieldValue("otp", "");
    // The token that sent the last code is spent; the widget needs to hand
    // out a new one before another send.
    captcha.reset();
  };

  return (
    <AuthSplit>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-10">
        <div className="flex w-full max-w-[356px] flex-col gap-6">
          <a
            href="https://www.openinary.dev"
            className="mb-10 self-center text-foreground"
          >
            <Logo className="h-6 w-auto" />
          </a>

          <div>
            <div className="text-center">
              {/* This page signs in *and* signs up, so it only greets someone as
                returning when the last-used cookie proves they are - otherwise
                it stays neutral. Same cookie as the badge below, read on
                the server so the first paint is already right. */}
              <h1 className="font-semibold text-[20px]/7 tracking-[-0.015em]">
                {sentTo
                  ? "Check your email"
                  : lastMethod
                    ? "Welcome back"
                    : "Welcome to Openinary Cloud"}
              </h1>
              <p className="mt-2 text-pretty text-[14px]/5 text-ds-muted">
                {sentTo ? (
                  `We sent a 6-digit code to ${sentTo}`
                ) : lastMethod ? (
                  "Continue with the method you used last time."
                ) : (
                  <>
                    Sign in or create your account.
                    <br />
                    We'll email you a 6-digit code.
                  </>
                )}
              </p>
            </div>
            <div className="mt-8">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void form.handleSubmit();
                }}
                className="grid gap-5"
              >
                {!sentTo && (
                  <>
                    <div className="grid gap-3">
                      <SocialButton
                        provider="google"
                        label="Login with Google"
                        lastUsed={lastMethod === "google"}
                      />
                      <SocialButton
                        provider="github"
                        label="Login with GitHub"
                        lastUsed={lastMethod === "github"}
                      />
                    </div>

                    <AuthSeparator />

                    <form.Field name="email">
                      {(field) => (
                        <div className="grid gap-2">
                          <Label htmlFor={field.name}>Email</Label>
                          <LastUsedBadge show={lastMethod === "email"}>
                            <Input
                              id={field.name}
                              name={field.name}
                              type="email"
                              autoComplete="email"
                              placeholder="m@example.com"
                              value={field.state.value}
                              onBlur={field.handleBlur}
                              onChange={(e) =>
                                field.handleChange(e.target.value)
                              }
                            />
                          </LastUsedBadge>
                          {field.state.meta.errors.map((error) => (
                            <p
                              key={error?.message}
                              className="text-destructive text-sm"
                            >
                              {error?.message}
                            </p>
                          ))}
                        </div>
                      )}
                    </form.Field>
                  </>
                )}

                {sentTo && (
                  <form.Field name="otp">
                    {(field) => (
                      <div className="grid gap-2">
                        <Label htmlFor={field.name} className="sr-only">
                          Code
                        </Label>
                        <InputOTP
                          id={field.name}
                          name={field.name}
                          maxLength={6}
                          // Only field on this step, reached by an explicit
                          // submit, so focus is where the user is already looking.
                          // (autoComplete="one-time-code" is the component's own
                          // default, which is what lets the OS offer the code.)
                          autoFocus
                          containerClassName="justify-center"
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(value) => {
                            field.handleChange(value);
                            // Submit on the last digit - typing it, or pasting
                            // the whole code at once. Fixing a wrong code drops
                            // back under six, so the correction re-submits too.
                            if (value.length === 6) void form.handleSubmit();
                          }}
                        >
                          <InputOTPGroup>
                            {[0, 1, 2, 3, 4, 5].map((i) => (
                              <InputOTPSlot key={i} index={i} />
                            ))}
                          </InputOTPGroup>
                        </InputOTP>
                        {field.state.meta.errors.map((error) => (
                          <p
                            key={error?.message}
                            className="text-center text-destructive text-sm"
                          >
                            {error?.message}
                          </p>
                        ))}
                      </div>
                    )}
                  </form.Field>
                )}

                <div className="grid">
                  {/* Stays mounted across both steps: the widget is rendered once
                  into this node, and unmounting it would leave the email step
                  captcha-less on the way back. It takes no room unless
                  Cloudflare asks for a click. */}
                  <div
                    ref={captcha.containerRef}
                    className={
                      captcha.interactive && !sentTo
                        ? "mb-5 flex justify-center"
                        : "h-0 overflow-hidden"
                    }
                  />

                  <form.Subscribe>
                    {(state) => (
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={!state.canSubmit || state.isSubmitting}
                      >
                        {state.isSubmitting ? (
                          <Loader2
                            className="animate-spin"
                            aria-label="Loading"
                          />
                        ) : sentTo ? (
                          "Sign in"
                        ) : (
                          "Send code"
                        )}
                      </Button>
                    )}
                  </form.Subscribe>
                </div>

                {sentTo && (
                  <button
                    type="button"
                    onClick={backToEmail}
                    className="text-center text-muted-foreground text-sm underline underline-offset-4 hover:text-primary"
                  >
                    Use a different email
                  </button>
                )}
              </form>
            </div>
          </div>

          <AuthFooter />
        </div>
      </div>
    </AuthSplit>
  );
}
