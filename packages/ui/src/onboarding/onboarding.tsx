"use client";

import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { ChevronLeft, ImageIcon, Upload } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { toast } from "sonner";

import { cn } from "../lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Spinner } from "../ui/spinner";
import { OnboardingPreview } from "./onboarding-preview";

export type OnboardingVariant = "cloud" | "self-hosted";

export interface OnboardingAnswers {
  /** 128px square data URL, or null for none. */
  image: string | null;
  name: string;
  role: string;
  workspaceName: string;
  /** Self-hosted only: 128px square data URL, or null for the default mark. */
  workspaceLogo: string | null;
  /** Cloud only, free text. */
  workspaceDescription: string;
  useCases: string[];
  /** Null when the last step was skipped. */
  source: string | null;
}

export interface OnboardingProps {
  variant: OnboardingVariant;
  user: { name?: string | null; image?: string | null };
  /** Current workspace (cloud: the active bucket). No name derives one from the user's. */
  workspace: { name?: string; logo?: string | null };
  /** Stands in for the workspace logo when none is uploaded (cloud: the bucket's avatar). */
  workspaceMark?: ReactNode;
  /** Shown under the last step's buttons, e.g. where the answers go. */
  note?: ReactNode;
  /** Persists the answers. A throw keeps the user on the last step with a toast. */
  onComplete: (answers: OnboardingAnswers) => Promise<void>;
  /** Fires each time a step is left forwards, for analytics. Steps are 0-3. */
  onStepComplete?: (
    step: number,
    answers: OnboardingAnswers,
    skipped: boolean,
  ) => void;
}

// Values are what gets stored and tracked, so they stay stable slugs even when
// a label is reworded.
export const ONBOARDING_ROLES = [
  { value: "student", label: "Student / Learning" },
  { value: "solo", label: "Solo developer / Hobbyist" },
  { value: "agency", label: "Agency / Freelancer" },
  { value: "startup", label: "Small team / Startup (2-10)" },
  { value: "growing", label: "Growing company (11-50)" },
  { value: "enterprise", label: "Established organization (51+)" },
];

export const ONBOARDING_USE_CASES = [
  { value: "images", label: "Optimizing images" },
  { value: "video", label: "Video delivery" },
  { value: "uploads", label: "User uploads" },
  { value: "ecommerce", label: "E-commerce catalog" },
  { value: "cms", label: "CMS or blog media" },
  { value: "saas", label: "SaaS product" },
  { value: "mobile", label: "Mobile app" },
  { value: "ai", label: "AI-generated media" },
  { value: "cloudinary", label: "Migrating from Cloudinary" },
  { value: "side-project", label: "Side project" },
  { value: "exploring", label: "Just exploring" },
];

export const ONBOARDING_SOURCES = [
  { value: "friend", label: "Friend or colleague" },
  { value: "x", label: "X (Twitter)" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "youtube", label: "YouTube" },
  { value: "github", label: "GitHub" },
  { value: "reddit", label: "Reddit" },
  { value: "hacker-news", label: "Hacker News" },
  { value: "ai", label: "AI assistant" },
  { value: "search", label: "Search engine" },
  { value: "newsletter", label: "Blog or newsletter" },
  { value: "other", label: "Other" },
];

const COPY = {
  cloud: {
    workspaceTitle: "Let's set up your bucket",
    workspaceSubtitle:
      "Buckets keep projects apart. This is how this one appears across Openinary.",
    logoLabel: null,
    nameLabel: "Bucket name",
    descriptionLabel: "What will it hold? (optional)",
    defaultName: (first: string) => `${first}'s bucket`,
  },
  "self-hosted": {
    workspaceTitle: "Let's set up your workspace",
    workspaceSubtitle: "This is how your dashboard appears in the sidebar.",
    logoLabel: "Workspace logo",
    nameLabel: "Workspace name",
    descriptionLabel: null,
    defaultName: (first: string) => `${first}'s Team`,
  },
} satisfies Record<OnboardingVariant, unknown>;

const STEPS = 4;
const EASE = [0.32, 0.72, 0, 1] as const;

/**
 * Crops a picked image to a centred square and shrinks it to a data URL small
 * enough to live in the user's `image` column.
 */
// ponytail: avatars ride inline as ~5-10 KB data URLs. Move them to object
// storage if anything starts listing users with their pictures in bulk.
async function toSquareDataUrl(file: File, size = 128): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  canvas
    .getContext("2d")
    ?.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      size,
      size,
    );
  bitmap.close();
  return canvas.toDataURL("image/webp", 0.85);
}

function ImageField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
          {value ? (
            <img src={value} alt="" className="size-full object-cover" />
          ) : (
            <ImageIcon className="size-4 text-muted-foreground" />
          )}
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => input.current?.click()}
        >
          <Upload />
          {value ? "Reupload" : "Upload image"}
        </Button>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => onChange(null)}
          >
            Remove
          </Button>
        )}
        <input
          ref={input}
          id={id}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="sr-only"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            // Cleared so picking the same file again still fires a change.
            e.target.value = "";
            if (!file) return;
            try {
              onChange(await toSquareDataUrl(file));
            } catch {
              toast.error("That image could not be read. Try a PNG or JPEG.");
            }
          }}
        />
      </div>
    </div>
  );
}

function ChoiceSelect({
  id,
  value,
  options,
  onChange,
}: {
  id: string;
  value: string | null;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => next !== null && onChange(next)}
      items={options}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue>
          {(current: string | null) =>
            options.find((option) => option.value === current)?.label ??
            "Select an option"
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * First-run questionnaire, shared by cloud and self-hosted: a four-step form
 * on the left, and on the right a preview of the dashboard that picks up each
 * answer as it is typed. Persisting and tracking the answers is the caller's
 * job (onComplete), since the two products store them in different places.
 */
export function Onboarding({
  variant,
  user,
  workspace,
  workspaceMark,
  note,
  onComplete,
  onStepComplete,
}: OnboardingProps) {
  const copy = COPY[variant];
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [answers, setAnswers] = useState<OnboardingAnswers>(() => ({
    image: user.image ?? null,
    name: user.name ?? "",
    role: "",
    workspaceName: workspace.name ?? "",
    workspaceLogo: workspace.logo ?? null,
    workspaceDescription: "",
    useCases: [],
    source: null,
  }));
  const set = (patch: Partial<OnboardingAnswers>) =>
    setAnswers((current) => ({ ...current, ...patch }));

  const canContinue = [
    !!answers.name.trim() && !!answers.role,
    !!answers.workspaceName.trim(),
    answers.useCases.length > 0,
    !!answers.source,
  ][step];

  const advance = async (final: OnboardingAnswers, skipped = false) => {
    onStepComplete?.(step, final, skipped);
    if (step === 0 && !final.workspaceName.trim()) {
      set({
        workspaceName: copy.defaultName(final.name.trim().split(/\s+/)[0]),
      });
    }
    if (step < STEPS - 1) {
      setStep(step + 1);
      return;
    }
    setSaving(true);
    try {
      await onComplete({
        ...final,
        name: final.name.trim(),
        workspaceName: final.workspaceName.trim(),
        workspaceDescription: final.workspaceDescription.trim(),
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save your answers",
      );
      setSaving(false);
    }
  };

  const skip = () => {
    const skipped =
      step === 2 ? { useCases: [] } : { source: null as string | null };
    set(skipped);
    void advance({ ...answers, ...skipped }, true);
  };

  const toggleUseCase = (value: string) =>
    set({
      useCases: answers.useCases.includes(value)
        ? answers.useCases.filter((v) => v !== value)
        : [...answers.useCases, value],
    });

  const titles = [
    ["Introduce yourself", "Tell us a few things about yourself."],
    [copy.workspaceTitle, copy.workspaceSubtitle],
    [
      "What are you planning to build?",
      "Select everything you'd like to use Openinary for.",
    ],
    ["One last thing...", "Where did you hear about us?"],
  ][step];

  return (
    <MotionConfig reducedMotion="user">
      <div className="fixed inset-0 z-50 flex bg-background text-foreground">
        <div className="relative flex min-w-0 flex-1 items-center justify-center px-4">
          {step > 0 && (
            <button
              type="button"
              disabled={saving}
              onClick={() => setStep(step - 1)}
              className="absolute top-4 left-4 inline-flex items-center gap-1 rounded-md px-1 text-muted-foreground text-sm outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <ChevronLeft className="size-4" />
              Back
            </button>
          )}

          <form
            className="w-full max-w-84"
            onSubmit={(e) => {
              e.preventDefault();
              if (canContinue && !saving) void advance(answers);
            }}
          >
            <div
              role="progressbar"
              aria-label="Onboarding progress"
              aria-valuemin={1}
              aria-valuemax={STEPS}
              aria-valuenow={step + 1}
              className="flex gap-1.5"
            >
              {Array.from({ length: STEPS }, (_, i) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length list
                  key={i}
                  className="h-0.5 flex-1 overflow-hidden rounded-full bg-foreground/15"
                >
                  <motion.div
                    className="h-full origin-left bg-foreground"
                    initial={false}
                    animate={{ scaleX: i <= step ? 1 : 0 }}
                    transition={{ duration: 0.4, ease: EASE }}
                  />
                </div>
              ))}
            </div>

            <div className="mt-5 h-80">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={step}
                  initial={{ opacity: 0, filter: "blur(6px)" }}
                  animate={{ opacity: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, filter: "blur(6px)" }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                >
                  <h1 className="font-medium text-lg tracking-tight">
                    {titles[0]}
                  </h1>
                  <p className="mt-1 text-muted-foreground text-sm">
                    {titles[1]}
                  </p>

                  <div className="mt-5 flex flex-col gap-4">
                    {step === 0 && (
                      <>
                        <ImageField
                          id="onboarding-avatar"
                          label="Profile picture"
                          value={answers.image}
                          onChange={(image) => set({ image })}
                        />
                        <div className="grid gap-2">
                          <Label htmlFor="onboarding-name">
                            What's your name?
                          </Label>
                          <Input
                            id="onboarding-name"
                            autoFocus
                            autoComplete="name"
                            maxLength={60}
                            placeholder="Enter your name..."
                            value={answers.name}
                            onChange={(e) => set({ name: e.target.value })}
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="onboarding-role">
                            What best describes you?
                          </Label>
                          <ChoiceSelect
                            id="onboarding-role"
                            value={answers.role || null}
                            options={ONBOARDING_ROLES}
                            onChange={(role) => set({ role })}
                          />
                        </div>
                      </>
                    )}

                    {step === 1 && (
                      <>
                        {copy.logoLabel && (
                          <ImageField
                            id="onboarding-logo"
                            label={copy.logoLabel}
                            value={answers.workspaceLogo}
                            onChange={(workspaceLogo) => set({ workspaceLogo })}
                          />
                        )}
                        <div className="grid gap-2">
                          <Label htmlFor="onboarding-workspace">
                            {copy.nameLabel}
                          </Label>
                          <Input
                            id="onboarding-workspace"
                            maxLength={60}
                            value={answers.workspaceName}
                            onChange={(e) =>
                              set({ workspaceName: e.target.value })
                            }
                          />
                        </div>
                        {copy.descriptionLabel && (
                          <div className="grid gap-2">
                            <Label htmlFor="onboarding-description">
                              {copy.descriptionLabel}
                            </Label>
                            <textarea
                              id="onboarding-description"
                              rows={3}
                              maxLength={280}
                              placeholder="Product photos, user avatars, course videos..."
                              value={answers.workspaceDescription}
                              onChange={(e) =>
                                set({ workspaceDescription: e.target.value })
                              }
                              className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-base shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
                            />
                          </div>
                        )}
                      </>
                    )}

                    {step === 2 && (
                      <div className="-mt-1 flex flex-wrap gap-2">
                        {ONBOARDING_USE_CASES.map((option) => {
                          const on = answers.useCases.includes(option.value);
                          return (
                            <button
                              key={option.value}
                              type="button"
                              aria-pressed={on}
                              onClick={() => toggleUseCase(option.value)}
                              className={cn(
                                "h-7 rounded-full px-2.5 text-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50",
                                on
                                  ? "bg-amber-400/15 text-amber-700 dark:text-amber-300"
                                  : "bg-muted text-muted-foreground hover:text-foreground",
                              )}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {step === 3 && (
                      <ChoiceSelect
                        id="onboarding-source"
                        value={answers.source}
                        options={ONBOARDING_SOURCES}
                        onChange={(source) => set({ source })}
                      />
                    )}
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="relative flex gap-2">
              {step >= 2 && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={saving}
                  onClick={skip}
                >
                  Skip
                </Button>
              )}
              <Button
                type="submit"
                className="flex-1"
                disabled={!canContinue || saving}
              >
                {saving ? (
                  <Spinner className="size-4" />
                ) : step === STEPS - 1 ? (
                  "Continue to Openinary"
                ) : (
                  "Continue"
                )}
              </Button>
              {/* Out of flow, so the buttons sit where they did on every
                  other step. */}
              {step === STEPS - 1 && note && (
                <p className="absolute top-full mt-3 text-muted-foreground text-xs leading-relaxed">
                  {note}
                </p>
              )}
            </div>
          </form>

          <p className="absolute bottom-4 left-4 text-muted-foreground text-xs">
            © Openinary {new Date().getFullYear()}
          </p>
        </div>

        <div className="relative hidden flex-1 overflow-hidden border-l bg-muted/50 md:block dark:bg-black/25">
          <OnboardingPreview
            step={step}
            answers={answers}
            useCases={ONBOARDING_USE_CASES.map((option) => option.value)}
            workspaceMark={workspaceMark}
          />
        </div>
      </div>
    </MotionConfig>
  );
}
