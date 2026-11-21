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
import { callbackErrorMessage } from "@/lib/auth-errors";
import { AuthError, AuthShell } from "@/components/auth-shell";
import { AuthSeparator } from "@openinary/dashboard/ui/social-button";
import {
  confirmPendingLoginMethod,
  forgetPendingLoginMethod,
  SsoButtons,
} from "@/components/sso-buttons";

const setupFormSchema = z
  .object({
    name: z.string().min(1, {
      message: "Name is required",
    }),
    email: z
      .string()
      .min(1, { message: "Email is required" })
      .email("Please enter a valid email address"),
    password: z
      .string()
      .min(8, {
        message: "Password must contain at least 8 characters",
      })
      .regex(/[A-Z]/, {
        message: "Password must contain at least one uppercase letter",
      })
      .regex(/[a-z]/, {
        message: "Password must contain at least one lowercase letter",
      })
      .regex(/[0-9]/, {
        message: "Password must contain at least one number",
      })
      .regex(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, {
        message: "Password must contain at least one special character",
      }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type SetupFormValues = z.infer<typeof setupFormSchema>;

export default function SetupPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [authOptions, setAuthOptions] = useState<AuthOptions>(PASSWORD_ONLY);

  // A first SSO sign-in that failed comes back here with ?error=<code>.
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

  const form = useForm<SetupFormValues>({
    resolver: zodResolver(setupFormSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    const checkAuthAndSetup = async () => {
      try {
        const configValidation = await validateAuthConfig();

        if (configValidation.authOptions) {
          setAuthOptions(configValidation.authOptions);
        }
        
        if (!configValidation.isValid) {
          setConfigError(configValidation.error || "Configuration error");
          setCheckingSetup(false);
          return;
        }

        const session = await authClient.getSession();
        
        if (session?.data?.session) {
          confirmPendingLoginMethod();
          router.push("/");
          return;
        }

        const response = await fetch("/api/check-setup");
        const data = await response.json();
        
        if (data.setupComplete) {
          router.push("/login");
        } else {
          setCheckingSetup(false);
        }
      } catch (err) {
        logger.error("Error checking auth/setup", { error: err });
        setCheckingSetup(false);
      }
    };

    checkAuthAndSetup();
  }, [router]);

  const onSubmit = async (values: SetupFormValues) => {
    setError("");

    try {
      // Not authClient.signUp: this endpoint refuses once an admin exists.
      const response = await fetch("/api/auth/setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: values.email,
          password: values.password,
          name: values.name,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "An error occurred while creating the account");
        return;
      }

      router.push("/login");
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "An error occurred while creating the account",
      );
    }
  };

  const { providers, passwordLogin } = authOptions;

  // The form itself, measured into a skeleton while the setup check runs.
  return (
    <Skeleton loading={checkingSetup} label="Loading setup">
      <AuthShell
        title={passwordLogin ? "Create your account" : "Set up Openinary"}
        description={
          passwordLogin
            ? "You'll be this instance's first admin. Pick a password you don't use anywhere else."
            : "Sign in with your organization's account. The first person to sign in becomes this instance's admin; everyone after joins with the default role."
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
            returnTo="/setup"
            disabled={!!configError}
            onError={setError}
          />

          {providers.length > 0 && passwordLogin && <AuthSeparator />}

          {!passwordLogin && error && <AuthError>{error}</AuthError>}

          {passwordLogin && (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input
                          type="text"
                          placeholder="Your name"
                          autoComplete="name"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="admin@example.com"
                          autoComplete="email"
                          {...field}
                        />
                      </FormControl>
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
                          autoComplete="new-password"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="••••••••"
                          autoComplete="new-password"
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
                {form.formState.isSubmitting
                  ? "Creating account…"
                  : "Create account"}
              </Button>
            </form>
          </Form>
          )}
          </div>
      </AuthShell>
    </Skeleton>
  );
}
