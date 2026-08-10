"use client";

import { useForm } from "@tanstack/react-form";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import z from "zod";
import { useTurnstile } from "@/hooks/use-turnstile";
import { authClient } from "@/lib/auth-client";
import { Logo } from "./logo";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Input } from "./ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "./ui/input-otp";
import { Label } from "./ui/label";

const ONBOARDING_ROUTE = "/get-started";

/**
 * There is no separate sign-up route - the same email-code endpoint registers
 * a first-time visitor - so "did this just create an account?" is read off the
 * user it hands back: the row was written milliseconds ago, in the very
 * request whose response this is. Google takes the exact path instead
 * (newUserCallbackURL, decided server-side), so this only covers the code.
 *
 * A minute of slack absorbs clock skew; a returning account is days old, and
 * a skew large enough to make one look fresh would have to match its age.
 */
function isFreshAccount(createdAt: Date | string) {
  return Date.now() - new Date(createdAt).getTime() < 60_000;
}

// The last-used method lives in a cookie, so it can only be read after
// hydration - reading it during render would mismatch the server HTML.
function useLastLoginMethod() {
  const [method, setMethod] = useState<string | null>(null);
  useEffect(() => {
    setMethod(authClient.getLastUsedLoginMethod());
  }, []);
  return method;
}

// Notification-style badge pinned to the button's top-right corner. `invert`
// flips it for the filled Login button, which the light pill sits badly on.
function LastUsedBadge({
  children,
  invert,
}: {
  children: React.ReactNode;
  invert?: boolean;
}) {
  return (
    <div className="relative">
      {children}
      <span
        className={`-top-2 pointer-events-none absolute right-2 z-10 rounded-full border px-1.5 py-0.5 font-medium text-[10px] shadow-sm ${
          invert
            ? "border-muted-foreground bg-primary text-primary-foreground"
            : "border-border bg-background text-muted-foreground"
        }`}
      >
        Last used
      </span>
    </div>
  );
}

export function GoogleButton({
  label,
  lastUsed,
}: {
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
            provider: "google",
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
  return lastUsed ? <LastUsedBadge>{button}</LastUsedBadge> : button;
}

export function AuthSeparator() {
  return (
    <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-border after:border-t">
      <span className="relative z-10 bg-card px-2 text-muted-foreground">
        Or continue with
      </span>
    </div>
  );
}

export function AuthFooter() {
  return (
    <div className="text-balance px-6 text-center text-muted-foreground text-xs [&_a]:underline [&_a]:underline-offset-4 [&_a]:hover:text-primary">
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

export default function SignInForm() {
  const router = useRouter();
  const captcha = useTurnstile();
  const lastMethod = useLastLoginMethod();
  // The address the code went to. Empty = still on the email step; no valid
  // email is ever "", so it doubles as the step flag.
  const [sentTo, setSentTo] = useState("");

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
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <a
          href="https://www.openinary.dev"
          className="self-center text-foreground"
        >
          <Logo className="h-7 w-auto" />
        </a>

        <Card>
          <CardHeader className="text-center">
            {/* This page signs in *and* signs up, so it only greets someone as
                returning when the last-used cookie proves they are - otherwise
                it stays neutral. Same cookie as the badge below, so both light
                up together after hydration. */}
            <CardTitle className="text-xl">
              {sentTo
                ? "Check your email"
                : lastMethod
                  ? "Welcome back"
                  : "Welcome to Openinary Cloud"}
            </CardTitle>
            <CardDescription>
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
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void form.handleSubmit();
              }}
              className="grid gap-6"
            >
              {!sentTo && (
                <>
                  <GoogleButton
                    label="Login with Google"
                    lastUsed={lastMethod === "google"}
                  />

                  <AuthSeparator />

                  <form.Field name="email">
                    {(field) => (
                      <div className="grid gap-2">
                        <Label htmlFor={field.name}>Email</Label>
                        <Input
                          id={field.name}
                          name={field.name}
                          type="email"
                          autoComplete="email"
                          placeholder="m@example.com"
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                        />
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

              {/* Stays mounted across both steps: the widget is rendered once
                  into this node, and unmounting it would leave the email step
                  captcha-less on the way back. */}
              <div
                ref={captcha.containerRef}
                className={
                  sentTo ? "hidden" : "flex justify-center empty:hidden"
                }
              />

              <form.Subscribe>
                {(state) => {
                  const button = (
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
                  );
                  // Only worth pointing at the email route before a code is
                  // requested; on the code step there is nothing else to pick.
                  return lastMethod === "email" && !sentTo ? (
                    <LastUsedBadge invert>{button}</LastUsedBadge>
                  ) : (
                    button
                  );
                }}
              </form.Subscribe>

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
          </CardContent>
        </Card>

        <AuthFooter />
      </div>
    </div>
  );
}
