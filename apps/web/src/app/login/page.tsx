"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Spinner } from "@/components/ui/spinner";
import logger from "@/lib/logger";

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
    let timeoutId: NodeJS.Timeout;

    const checkAuthAndSetup = async () => {
      try {  
        // First, check if user is already authenticated
        // Add timeout to prevent infinite loading
        const sessionPromise = authClient.getSession();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Session check timeout")), 3000)
        );
        
        const session = await Promise.race([sessionPromise, timeoutPromise]) as any;
        
        if (!isMounted) return;
        
        if (session?.data?.session) {
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
    timeoutId = setTimeout(() => {
      if (isMounted) {
        logger.warn("Auth check timeout - unblocking UI");
        setCheckingSetup(false);
      }
    }, 5000); // 5 second absolute timeout

    checkAuthAndSetup().finally(() => {
      if (isMounted && timeoutId) {
        clearTimeout(timeoutId);
      }
    });

    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
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
        // Check if cookie is set
        const cookies = document.cookie.split(';').map(c => c.trim());
        const sessionCookie = cookies.find(c => c.startsWith('better-auth.session_token'));

        // Wait a bit for cookie to be set, then redirect
        // This ensures the cookie is available when middleware checks
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Use window.location for a full page reload to ensure cookies are synced
        // This prevents issues with cookie synchronization after login
        window.location.href = "/";
      } else {
        logger.error("[Login] Sign in failed - no data in result");
        throw new Error("Sign in failed - please try again");
      }
    } catch (err: any) {
      logger.error("[Login] Sign in error", { error: err });
      setError(err.message || "Incorrect email or password");
    }
  };

  if (checkingSetup) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="text-center">
          <Spinner className="mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
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
            Sign In
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to your account
          </p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="mt-8 space-y-6">
            <div className="space-y-4">
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
                        autoComplete="current-password"
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
              disabled={form.formState.isSubmitting}
              className="w-full"
            >
              {form.formState.isSubmitting ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}
