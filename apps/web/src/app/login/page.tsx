"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { authClient } from "@/lib/auth-client";
import { Button } from "@openinary/dashboard/ui/button";
import { Input } from "@openinary/dashboard/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Skeleton } from "skullet/react";
import logger from "@/lib/logger";
import {
  type AuthOptions,
  PASSWORD_ONLY,
  validateAuthConfig,
} from "@/lib/validate-auth-config";
import { callbackErrorMessage, describeAuthError } from "@/lib/auth-errors";
import { AuthError, AuthShell } from "@/components/auth-shell";
import { AuthSeparator, LastUsedBadge } from "@openinary/dashboard/ui/social-button";
import {
  confirmPendingLoginMethod,
  forgetPendingLoginMethod,
  rememberLoginMethod,
  SsoButtons,
  useLastLoginMethod,
} from "@/components/sso-buttons";

const loginFormSchema = z.object({
  email: z
    .string()
    .min(1, { message: "Email is required" })
    .email("Please enter a valid email address"),
  password: z.string().min(1, {
    message: "Password is required",
  }),
});

type LoginFormValues = z.infer<typeof loginFormSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  // Password only until the server says otherwise: what every instance drew
  // before SSO, and the shape the skeleton measures.
  const [authOptions, setAuthOptions] = useState<AuthOptions>(PASSWORD_ONLY);
  const lastMethod = useLastLoginMethod();

  // A failed SSO callback lands back here with ?error=<code>. Read once, then
  // dropped from the address bar so a reload doesn't show it again.
  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("error");
    if (!code) return;
    forgetPendingLoginMethod();
    setError(callbackErrorMessage(code));
    url.searchParams.delete("error");
    url.searchParams.delete("error_description");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, []);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  // Check if user is already authenticated and if setup is required on mount
  useEffect(() => {
    let isMounted = true;

    const checkAuthAndSetup = async () => {
      try {
        // First, validate authentication configuration
        const configValidation = await validateAuthConfig();
        
        if (!isMounted) return;

        if (configValidation.authOptions) {
          setAuthOptions(configValidation.authOptions);
        }
        
        if (!configValidation.isValid) {
          // Show configuration error and block access
          setConfigError(configValidation.error || "Configuration error");
          setCheckingSetup(false);
          return;
        }
        
        // Next, check if user is already authenticated
        // Add timeout to prevent infinite loading
        const sessionPromise = authClient.getSession();
        // Promise<never>: it only ever rejects, so the race keeps the session's
        // own type instead of widening to unknown.
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Session check timeout")), 3000)
        );

        const session = await Promise.race([sessionPromise, timeoutPromise]);
        
        if (!isMounted) return;
        
        if (session?.data?.session) {
          confirmPendingLoginMethod();
          // User is already signed in, redirect to home
          router.push("/");
          return;
        }

        // If not authenticated, check if setup is required
        const response = await fetch("/api/check-setup", {
          signal: AbortSignal.timeout(3000), // 3 second timeout
        });
        const data = await response.json();
        
        if (!isMounted) return;
        
        if (!data.setupComplete) {
          router.push("/setup");
        } else {
          setCheckingSetup(false);
        }
      } catch (err) {
        logger.error("Error checking auth/setup", { error: err });
        if (!isMounted) return;
        
        // On error, still check setup status to avoid being stuck
        try {
          const response = await fetch("/api/check-setup", {
            signal: AbortSignal.timeout(3000),
          });
          const data = await response.json();
          if (!isMounted) return;
          
          if (!data.setupComplete) {
            router.push("/setup");
          } else {
            setCheckingSetup(false);
          }
        } catch (setupErr) {
          logger.error("Error checking setup", { error: setupErr });
          // Always unblock the UI after timeout/error to prevent infinite loading
          if (isMounted) {
            setCheckingSetup(false);
          }
        }
      }
    };

    // Add a fallback timeout to ensure we never stay stuck
    const timeoutId = setTimeout(() => {
      if (isMounted) {
        logger.warn("Auth check timeout - unblocking UI");
        setCheckingSetup(false);
      }
    }, 5000); // 5 second absolute timeout

    checkAuthAndSetup().finally(() => {
      if (isMounted) {
        clearTimeout(timeoutId);
      }
    });

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [router]);

  const onSubmit = async (values: LoginFormValues) => {
    setError("");

    try {
      const result = await authClient.signIn.email({
        email: values.email,
        password: values.password,
      });

      // Verify the sign-in was successful
      if (result && result.data) {
        // An SSO click this tab abandoned earlier mustn't win once we land.
        forgetPendingLoginMethod();
        rememberLoginMethod("email");
        // Wait a bit for cookie to be set, then redirect
        // This ensures the cookie is available when middleware checks
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Use window.location for a full page reload to ensure cookies are synced
        // This prevents issues with cookie synchronization after login
        window.location.href = "/";
      } else {
        logger.error("[Login] Sign in failed - no data in result", { result });
        setError(describeAuthError(result?.error, "Sign in failed - please try again"));
        return;
      }
    } catch (err) {
      logger.error("[Login] Sign in error", { error: err });
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Incorrect email or password",
      );
    }
  };

  const { providers, passwordLogin } = authOptions;
  const hasSso = providers.length > 0;

  // The form itself, measured into a skeleton while the setup check runs.
  return (
    <Skeleton loading={checkingSetup} label="Loading sign in">
      <AuthShell
        title="Sign in"
        description={
          passwordLogin
            ? "Welcome back. Sign in to your account on this instance."
            : "Welcome back. Sign in with your organization's account."
        }
      >
          {configError && (
            <pre className="mb-4 whitespace-pre-wrap rounded-[10px] bg-ds-red/10 px-3.5 py-2.5 font-mono text-ds-red text-xs">
              {configError}
            </pre>
          )}

          <div className="grid gap-5">
            <SsoButtons
              providers={providers}
              returnTo="/login"
              lastMethod={lastMethod}
              disabled={!!configError}
              onError={setError}
            />

            {hasSso && passwordLogin && <AuthSeparator />}

            {passwordLogin ? (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <LastUsedBadge show={hasSso && lastMethod === "email"}>
                            <FormControl>
                              <Input
                                type="email"
                                placeholder="you@example.com"
                                autoComplete="email"
                                {...field}
                              />
                            </FormControl>
                          </LastUsedBadge>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder="••••••••"
                              autoComplete="current-password"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {error && <AuthError>{error}</AuthError>}

                  <Button
                    type="submit"
                    disabled={form.formState.isSubmitting || !!configError}
                    className="w-full"
                  >
                    {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
                  </Button>
                </form>
              </Form>
            ) : (
              <>
                {error && <AuthError>{error}</AuthError>}
                {!hasSso && !configError && (
                  // Password sign-in off and no provider: nothing to offer.
                  <AuthError>
                    No sign-in method is configured on this instance. Set
                    AUTH_PROVIDERS, or turn AUTH_PASSWORD_LOGIN back on.
                  </AuthError>
                )}
              </>
            )}
          </div>
      </AuthShell>
    </Skeleton>
  );
}
