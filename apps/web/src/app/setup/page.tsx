"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
// import { useRef } from "react"; // Commented out - not needed without animations
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
// import { motion, AnimatePresence } from "framer-motion";
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
// import { ShaderAnimation } from "@/components/ui/shader-animation";

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

// type IntroPhase = "shader" | "text" | "form";

export default function SetupPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [checkingSetup, setCheckingSetup] = useState(true);
  // const [introPhase, setIntroPhase] = useState<IntroPhase>("shader");
  // const [showForm, setShowForm] = useState(false);
  // const [introStarted, setIntroStarted] = useState(false);
  // const [textVisible, setTextVisible] = useState(false);
  // const audioRef = useRef<HTMLAudioElement | null>(null);

  const form = useForm<SetupFormValues>({
    resolver: zodResolver(setupFormSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  // Check if user is already authenticated or if setup is already complete
  useEffect(() => {
    const checkAuthAndSetup = async () => {
      try {
        // First, check if user is already authenticated
        const session = await authClient.getSession();
        
        if (session?.data?.session) {
          // User is already signed in, redirect to home
          router.push("/");
          return;
        }

        // If not authenticated, check if setup is already complete
        const response = await fetch("/api/check-setup");
        const data = await response.json();
        
        if (data.setupComplete) {
          // Users already exist, redirect to login
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

  // ANIMATIONS COMMENTED OUT - Form displays immediately
  // // Start introduction sequence
  // const startIntroduction = () => {
  //   if (introStarted) return;

  //   // Use existing audio or create new one
  //   const audio = audioRef.current || new Audio("/setup.mp3");
  //   audioRef.current = audio;
    
  //   // Preload audio
  //   audio.preload = "auto";
  //   audio.volume = 1.0;
  //   // Ensure audio plays until the end (19 seconds)
  //   audio.loop = false;

  //   // Play audio
  //   const playAudio = async () => {
  //     try {
  //       await audio.play();
  //       console.log("Audio started playing (19 seconds)");
        
  //       // Log when audio ends
  //       audio.onended = () => {
  //         console.log("Audio finished playing");
  //       };
  //     } catch (err: any) {
  //       console.error("Error playing audio:", err);
  //     }
  //   };

  //   // Load and play audio
  //   if (audio.readyState === 0) {
  //     audio.load();
  //   }
  //   playAudio();

  //   // Wait 0.3 seconds before showing shader animation
  //   setTimeout(() => {
  //     setIntroStarted(true);
  //   }, 300);

  //   // Phase 1: Shader (0-5 seconds from when shader appears)
  //   setTimeout(() => {
  //     setIntroPhase("text");
  //     setTextVisible(true);
  //   }, 5300); // 300ms delay + 5000ms shader duration

  //   // Phase 2: Text ends, start fade out (10 seconds from when shader appears)
  //   setTimeout(() => {
  //     setTextVisible(false);
  //   }, 10300); // 300ms delay + 10000ms

  //   // Phase 3: Form appears (after transition, at 10.5 seconds from when shader appears)
  //   setTimeout(() => {
  //     setIntroPhase("form");
  //     setShowForm(true);
  //   }, 10800); // 300ms delay + 10500ms
  // };

  // // Auto-start introduction when setup check is complete
  // useEffect(() => {
  //   if (checkingSetup || introStarted) return;
    
  //   // Initialize audio
  //   const audio = new Audio("/setup.mp3");
  //   audio.preload = "auto";
  //   audio.volume = 1.0;
  //   audioRef.current = audio;
    
  //   // Try to auto-start
  //   audio.load();
  //   audio.play()
  //     .then(() => {
  //       // Autoplay succeeded, start introduction
  //       startIntroduction();
  //     })
  //     .catch((err: any) => {
  //       // Autoplay blocked, will need user interaction
  //       console.log("Autoplay blocked, waiting for user interaction");
  //     });
  // }, [checkingSetup, introStarted]);

  // // Cleanup audio only on component unmount (not on state changes)
  // // This ensures the audio plays for the full 19 seconds even after the form appears
  // useEffect(() => {
  //   return () => {
  //     // Only cleanup when component is actually unmounting (user navigates away)
  //     if (audioRef.current) {
  //       audioRef.current.pause();
  //       audioRef.current.currentTime = 0;
  //       audioRef.current = null;
  //     }
  //   };
  // }, []);

  const onSubmit = async (values: SetupFormValues) => {
    setError("");

    try {
      // Use the secure setup endpoint instead of direct signup
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

      // Redirect to login after successful account creation
      router.push("/login");
    } catch (err: any) {
      setError(err.message || "An error occurred while creating the account");
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
    <div className="relative flex min-h-screen items-center justify-center bg-white px-4 overflow-hidden">
      {/* ANIMATIONS COMMENTED OUT - Form displays immediately */}
      {/* 
      {!introStarted && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="relative z-20"
        >
          <Button
            onClick={startIntroduction}
            size="lg"
            className="text-lg px-8 py-6"
          >
            Start
          </Button>
        </motion.div>
      )}
      <AnimatePresence mode="wait">
        Phase 1: Shader Animation (0-5 seconds)
        {introStarted && introPhase === "shader" && (
          <motion.div
            key="shader"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0 w-full h-full"
          >
            <ShaderAnimation />
          </motion.div>
        )}

        Phase 2: Hello Text (5.5-10 seconds, then fades out 0.5s until 10.5s)
        {introStarted && introPhase === "text" && (
          <motion.div
            key="text"
            initial={{ opacity: 0, y: 20 }}
            animate={{ 
              opacity: textVisible ? 1 : 0, 
              y: textVisible ? 0 : -20 
            }}
            transition={{ 
              duration: 0.5, 
              ease: textVisible ? "easeOut" : "easeIn"
            }}
            className="relative z-10 text-center"
          >
            <h1 className="text-5xl font-bold tracking-tight text-foreground">
              Hello, stranger
            </h1>
          </motion.div>
        )}

        Phase 3: Form (after 10.5 seconds)
        {showForm && (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="relative z-10 w-full max-w-md space-y-8"
          >
            ...form content...
          </motion.div>
        )}
      </AnimatePresence>
      */}
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
              disabled={form.formState.isSubmitting}
              className="w-full"
            >
              {form.formState.isSubmitting
                ? "Creating account..."
                : "Create administrator account"}
            </Button>
          </form>
        </Form>
      </div>
      {/* </AnimatePresence> */}
    </div>
  );
}
