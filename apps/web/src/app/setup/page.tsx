"use client";

import Image from "next/image";
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
import { validateAuthConfig } from "@/lib/validate-auth-config";
import { VersionBadge } from "@/components/ui/version-badge";

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
        
        if (!configValidation.isValid) {
          setConfigError(configValidation.error || "Configuration error");
          setCheckingSetup(false);
          return;
        }

        const session = await authClient.getSession();
        
        if (session?.data?.session) {
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

  // The form itself, measured into a skeleton while the setup check runs.
  return (
    <Skeleton loading={checkingSetup} label="Loading setup">
      <div className="relative flex min-h-screen items-center justify-center bg-background px-4 overflow-hidden">
        <VersionBadge />
        <div className="relative z-10 w-full max-w-md space-y-8">
          <div className="flex justify-center">
            <Image
              src="/openinary.svg"
              alt="Openinary"
              width={120}
              height={120}
              className="dark:invert"
            />
          </div>
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tight">
              Initial Setup
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Create the first administrator account
            </p>
          </div>

          {configError && (
            <div className="rounded-md bg-destructive/15 p-4 border border-destructive/30">
              <pre className="text-xs text-destructive whitespace-pre-wrap font-mono">
                {configError}
              </pre>
            </div>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="mt-8 space-y-6">
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
                      <FormLabel>Confirm Password</FormLabel>
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

              {error && (
                <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={form.formState.isSubmitting || !!configError}
                className="w-full"
              >
                {form.formState.isSubmitting
                  ? "Creating account..."
                  : "Create administrator account"}
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </Skeleton>
  );
}
