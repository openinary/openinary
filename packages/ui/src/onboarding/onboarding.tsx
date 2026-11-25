"use client";

import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { Check, ImageIcon, Upload } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { celebrate } from "../lib/celebrate";
import { cn } from "../lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Spinner } from "../ui/spinner";

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
  /**
   * Shows the workspace step without letting this user change it, for a
   * workspace someone else manages (self-hosted: only admins do). No name
   * then reads "Openinary" rather than one derived from the user's, and
   * onComplete gets the workspace back as it was passed.
   */
  workspaceReadOnly?: boolean;
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
  { value: "student", label: "Student" },
  { value: "solo", label: "Solo developer" },
  { value: "agency", label: "Agency or freelancer" },
  { value: "startup", label: "Small team (2-10)" },
  { value: "growing", label: "Company (11-50)" },
  { value: "enterprise", label: "Organization (51+)" },
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

/** The workspace step when workspaceReadOnly is set. */
const READ_ONLY_COPY = {
  workspaceTitle: "Your team's workspace",
  workspaceSubtitle:
    "Everyone here shares this workspace. Its name and logo are managed by your admins.",
  fallbackName: "Openinary",
};

/** Night sky over a blue horizon, fading into the page so the bottom stays plain. */
const SKY =
  "linear-gradient(180deg, #050b22 0%, #0a1846 24%, #1a49c4 44%, #3d7bf0 50%, #a9c6f8 58%, var(--ds-panel) 70%)";

const BACKDROP_CLASS =
  "fixed inset-0 z-50 flex flex-col overflow-y-auto bg-ds-panel text-ds-text";

/**
 * The onboarding's sky on its own. Gates draw it while they don't know yet
 * whether the account has onboarded, so the dashboard never flashes first.
 */
export function OnboardingBackdrop() {
  return <div className={BACKDROP_CLASS} style={{ backgroundImage: SKY }} />;
}

/**
 * Marks this browser as having seen an onboarded account. The dashboard
 * layouts read the `onboarded` cookie on the server and skip the backdrop.
 */
export function rememberOnboarded() {
  document.cookie = "onboarded=1; path=/; max-age=31536000; samesite=lax";
}

/** The Openinary mark in currentColor, so cloud and self-hosted show the same one. */
function OpeninaryMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 104 104"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M42.9136 103.049H39.6245C31.0807 103.049 25.9403 103.047 22.0137 102.317L44.7386 72.2227L42.9136 103.049Z" />
      <path d="M80.5019 102.41C76.6427 103.047 71.5864 103.05 63.4218 103.05H59.5335L57.6992 72.2148L80.5019 102.41Z" />
      <path d="M102.201 81.5916C102.035 82.3812 101.839 83.1237 101.601 83.8376C100.042 88.5111 97.3051 92.6215 93.7383 95.8315L68.1133 67.0957L102.201 81.5916Z" />
      <path d="M8.97896 95.5262C5.57455 92.3623 2.95561 88.3663 1.44514 83.8388C1.18358 83.0546 0.966405 82.2375 0.791016 81.3597L34.3251 67.1016L8.97896 95.5262Z" />
      <path d="M103.051 63.4231C103.051 66.3201 103.043 68.8257 103.015 71.0253L72.582 59.2695H103.051V63.4231Z" />
      <path d="M29.8745 59.2695L0.0274456 70.7968C0.00181909 68.6523 0 66.2201 0 63.4231V59.2695H29.8745Z" />
      <path d="M63.4224 0C74.1457 0 79.5076 0.00142634 83.8372 1.44547C92.2236 4.24338 98.8059 10.8255 101.604 19.2119C103.048 23.5415 103.049 28.9035 103.049 39.6268V51.5658H70.8692L94.079 41.6991L87.1948 37.1294L64.6757 45.8249L75.2468 31.837L67.6443 29.7557L55.9709 42.8381L55.1017 28.1043H47.3575L46.4747 42.8381L34.8103 29.7557L27.2125 31.837L37.7698 45.8206L15.2643 37.1294L8.38006 41.6991L31.5853 51.5658H0V39.6268C0 28.9035 0.00142634 23.5415 1.44547 19.2119C4.24338 10.8255 10.8255 4.24338 19.2119 1.44547C23.5415 0.00142634 28.9035 0 39.6268 0H63.4224Z" />
    </svg>
  );
}

const STEPS = 4;
const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Crops a picked image to a centred square and shrinks it to a data URL small
 * enough to live in the user's `image` column.
 */
// ponytail: avatars ride inline as ~5-10 KB data URLs. Move them to object
// storage if anything starts listing users with their pictures in bulk.
export async function toSquareDataUrl(
  file: File,
  size = 128,
): Promise<string> {
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

/** Replays the shake on an element, then gives it (or its first control) focus. */
function shake(element: HTMLElement | null | undefined) {
  if (!element) return;
  element.classList.remove("ds-shake");
  // Reading a layout property restarts the animation on the next add.
  void element.offsetWidth;
  element.classList.add("ds-shake");
  (element.matches("input, textarea, button")
    ? element
    : element.querySelector<HTMLElement>("button, input")
  )?.focus();
}

const labelClass = "font-medium text-[13px]/5 text-ds-secondary";

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  /** Left out when the step's title already asks the question. */
  label?: string;
  htmlFor?: string;
  /** Shown under the control once the step was tried without it. */
  error?: string | false;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {label &&
        (htmlFor ? (
          <Label htmlFor={htmlFor} className={labelClass}>
            {label}
          </Label>
        ) : (
          <span className={labelClass}>{label}</span>
        ))}
      {children}
      {error && (
        <p role="alert" className="ds-field-error mt-0!">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * A small square preview with upload, replace and remove buttons. Picked
 * images are cropped and shrunk with toSquareDataUrl, so `value` is always a
 * 128px data URL (or null). `id` goes on the hidden file input, for a label.
 */
export function ImagePicker({
  id,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  id: string;
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  /** Drawn in the preview when there is no image. Defaults to an image icon. */
  placeholder?: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-2">
      <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-ds-hover inset-ring inset-ring-ds-border">
        {value ? (
          <img src={value} alt="" className="size-full object-cover" />
        ) : (
          (placeholder ?? <ImageIcon className="size-4 text-ds-faint" />)
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        <Upload />
        {value ? "Replace" : "Upload image"}
      </Button>
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
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
        disabled={disabled}
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
  );
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
  return (
    <Field label={label} htmlFor={id}>
      <ImagePicker id={id} value={value} onChange={onChange} />
    </Field>
  );
}

const choiceClass =
  "flex min-h-9 cursor-pointer items-center justify-between gap-2 rounded-[9px] bg-(--ds-raised) px-3 py-2 text-left text-[13px]/4 text-ds-secondary shadow-(--ds-raised-shadow) outline-none transition-[color,background-color,box-shadow,scale] duration-150 hover:text-ds-text focus-visible:outline-2 focus-visible:outline-ds-ring focus-visible:outline-offset-2 active:scale-[0.985] motion-reduce:active:scale-100";
const choiceOnClass =
  "bg-ds-subtle text-ds-text shadow-[inset_0_1px_2px_rgb(0_0_0/0.08),0_0_0_1px_var(--ds-ring)]";

/** One answer out of a few: a grid of raised rows, the picked one ringed. */
function Choices({
  label,
  value,
  options,
  onChange,
  invalid,
}: {
  label: string;
  value: string | null;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  invalid?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-invalid={invalid || undefined}
      data-missing={invalid || undefined}
      className="grid grid-cols-1 gap-1.5 sm:grid-cols-2"
    >
      {options.map((option) => {
        const on = option.value === value;
        return (
          // biome-ignore lint/a11y/useSemanticElements: a styled radio row
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(option.value)}
            className={cn(choiceClass, on && choiceOnClass)}
          >
            {option.label}
            {on && (
              <Check
                className="mi-pop size-3.5 shrink-0 text-ds-blue"
                strokeWidth={2.4}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Holds a step and animates to its height, so the card grows and shrinks
 * between steps instead of jumping.
 */
function StepFrame({ children }: { children: ReactNode }) {
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();

  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    // The negative margin gives focus rings and choice shadows room inside
    // the clipped frame.
    <div
      className="-mx-1 overflow-hidden transition-[height] duration-[340ms] ease-swap motion-reduce:transition-none"
      style={{ height }}
    >
      <div ref={inner} className="px-1 pt-1 pb-1">
        {children}
      </div>
    </div>
  );
}

/**
 * First-run questionnaire, shared by cloud and self-hosted: one card, four
 * short steps, a segmented progress bar. Continue stays clickable when an
 * answer is missing, so the click can point at it. Persisting and tracking
 * the answers is the caller's job (onComplete), since the two products store
 * them in different places.
 */
export function Onboarding({
  variant,
  user,
  workspace,
  workspaceReadOnly = false,
  note,
  onComplete,
  onStepComplete,
}: OnboardingProps) {
  const copy = COPY[variant];
  const sharedName = workspace.name?.trim() || READ_ONLY_COPY.fallbackName;
  const form = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  // The step Continue was last pressed on with something missing.
  const [tried, setTried] = useState(-1);
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

  const missing = {
    name: step === 0 && !answers.name.trim(),
    role: step === 0 && !answers.role,
    workspaceName:
      step === 1 && !workspaceReadOnly && !answers.workspaceName.trim(),
    useCases: step === 2 && answers.useCases.length === 0,
    source: step === 3 && !answers.source,
  };
  const canContinue = !Object.values(missing).some(Boolean);
  const flagged = (field: keyof typeof missing) =>
    tried === step && missing[field];

  const go = (next: number) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  };

  const advance = async (final: OnboardingAnswers, skipped = false) => {
    onStepComplete?.(step, final, skipped);
    if (step === 0 && !workspaceReadOnly && !final.workspaceName.trim()) {
      set({
        workspaceName: copy.defaultName(final.name.trim().split(/\s+/)[0]),
      });
    }
    if (step < STEPS - 1) {
      go(step + 1);
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
      // The dashboard is opening behind the card: mark the moment once.
      setTimeout(() => {
        celebrate();
        toast.success("You're set up. Welcome to Openinary.");
      }, 450);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save your answers",
      );
      setSaving(false);
    }
  };

  const submit = () => {
    if (saving) return;
    if (canContinue) return void advance(answers);
    setTried(step);
    // After the render that marks what is missing.
    requestAnimationFrame(() =>
      shake(form.current?.querySelector<HTMLElement>("[data-missing]")),
    );
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

  const [title, subtitle] = [
    ["Introduce yourself", "So the dashboard knows what to call you."],
    workspaceReadOnly
      ? [READ_ONLY_COPY.workspaceTitle, READ_ONLY_COPY.workspaceSubtitle]
      : [copy.workspaceTitle, copy.workspaceSubtitle],
    [
      "What are you building?",
      "Pick everything you'd use Openinary for. You can change this later.",
    ],
    ["One last thing", "Where did you hear about us?"],
  ][step];

  return (
    <MotionConfig reducedMotion="user">
      <div className={BACKDROP_CLASS} style={{ backgroundImage: SKY }}>
        <div className="ds-rise mx-auto flex w-full max-w-[460px] flex-1 flex-col justify-center px-4 py-10">
          <div className="mb-6 flex items-center justify-center gap-2 text-white">
            <OpeninaryMark className="size-5" />
            <span className="font-semibold text-[17px]/6 tracking-[-0.02em]">
              Openinary
            </span>
          </div>

          <form
            ref={form}
            noValidate
            className="ds-modal p-6 sm:p-8"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="flex items-center gap-3">
              <div
                role="progressbar"
                aria-label="Setup progress"
                aria-valuemin={1}
                aria-valuemax={STEPS}
                aria-valuenow={step + 1}
                className="flex flex-1 gap-1.5"
              >
                {Array.from({ length: STEPS }, (_, i) => (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length list
                    key={i}
                    className={cn(
                      "h-[3px] flex-1 rounded-full transition-colors duration-300",
                      i <= step ? "bg-ds-blue" : "bg-ds-border-strong",
                    )}
                  />
                ))}
              </div>
              <span className="shrink-0 text-[12.5px]/4 text-ds-muted tabular-nums">
                Step {step + 1} of {STEPS}
              </span>
            </div>

            <div className="mt-6">
              <StepFrame>
                <AnimatePresence mode="wait" initial={false} custom={direction}>
                  <motion.div
                    key={step}
                    custom={direction}
                    variants={{
                      enter: (dir: number) => ({
                        opacity: 0,
                        x: 12 * dir,
                        filter: "blur(4px)",
                      }),
                      show: { opacity: 1, x: 0, filter: "blur(0px)" },
                      exit: (dir: number) => ({
                        opacity: 0,
                        x: -12 * dir,
                        filter: "blur(4px)",
                        transition: { duration: 0.18, ease: EASE },
                      }),
                    }}
                    initial="enter"
                    animate="show"
                    exit="exit"
                    transition={{ duration: 0.26, ease: EASE }}
                  >
                    <h1 className="font-semibold text-[18px]/6 tracking-[-0.01em]">
                      {title}
                    </h1>
                    <p className="mt-1.5 text-[13.5px]/5 text-ds-muted text-pretty">
                      {subtitle}
                    </p>

                    <div className="mt-6 flex flex-col gap-4">
                      {step === 0 && (
                        <>
                          <ImageField
                            id="onboarding-avatar"
                            label="Profile picture"
                            value={answers.image}
                            onChange={(image) => set({ image })}
                          />
                          <Field
                            label="Your name"
                            htmlFor="onboarding-name"
                            error={flagged("name") && "Tell us your name."}
                          >
                            <Input
                              id="onboarding-name"
                              autoFocus
                              autoComplete="name"
                              maxLength={60}
                              placeholder="Ada Lovelace"
                              value={answers.name}
                              data-missing={flagged("name") || undefined}
                              data-invalid={flagged("name") || undefined}
                              onChange={(e) => set({ name: e.target.value })}
                            />
                          </Field>
                          <Field
                            label="What best describes you?"
                            error={flagged("role") && "Choose one."}
                          >
                            <Choices
                              label="What best describes you?"
                              value={answers.role || null}
                              options={ONBOARDING_ROLES}
                              onChange={(role) => set({ role })}
                              invalid={flagged("role")}
                            />
                          </Field>
                        </>
                      )}

                      {step === 1 && workspaceReadOnly && (
                        <div className="flex items-center gap-3 rounded-[10px] bg-ds-hover px-3 py-3 inset-ring inset-ring-ds-border">
                          <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-ds-panel inset-ring inset-ring-ds-border">
                            {workspace.logo ? (
                              <img
                                src={workspace.logo}
                                alt=""
                                className="size-full object-cover"
                              />
                            ) : (
                              <OpeninaryMark className="size-4.5 text-ds-text" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-[14px]/5">
                              {sharedName}
                            </p>
                            <p className="text-[12.5px]/[18px] text-ds-muted">
                              Admins can change it in Settings › Workspace.
                            </p>
                          </div>
                        </div>
                      )}

                      {step === 1 && !workspaceReadOnly && (
                        <>
                          {copy.logoLabel && (
                            <ImageField
                              id="onboarding-logo"
                              label={copy.logoLabel}
                              value={answers.workspaceLogo}
                              onChange={(workspaceLogo) =>
                                set({ workspaceLogo })
                              }
                            />
                          )}
                          <Field
                            label={copy.nameLabel}
                            htmlFor="onboarding-workspace"
                            error={
                              flagged("workspaceName") && "Give it a name."
                            }
                          >
                            <Input
                              id="onboarding-workspace"
                              autoFocus
                              maxLength={60}
                              value={answers.workspaceName}
                              data-missing={
                                flagged("workspaceName") || undefined
                              }
                              data-invalid={
                                flagged("workspaceName") || undefined
                              }
                              onChange={(e) =>
                                set({ workspaceName: e.target.value })
                              }
                            />
                          </Field>
                          {copy.descriptionLabel && (
                            <Field
                              label={copy.descriptionLabel}
                              htmlFor="onboarding-description"
                            >
                              <textarea
                                id="onboarding-description"
                                rows={3}
                                maxLength={280}
                                placeholder="Product photos, user avatars, course videos..."
                                value={answers.workspaceDescription}
                                onChange={(e) =>
                                  set({ workspaceDescription: e.target.value })
                                }
                                className="w-full resize-none rounded-[8px] border border-ds-border-strong bg-ds-field px-2.5 py-2 text-base text-ds-text outline-none transition-[border-color,box-shadow] placeholder:text-ds-faint hover:border-ds-border-hover focus-visible:border-ds-ring focus-visible:ring-[3px] focus-visible:ring-ds-ring/20 md:text-[13px]/5"
                              />
                            </Field>
                          )}
                        </>
                      )}

                      {step === 2 && (
                        <Field
                          error={
                            flagged("useCases") &&
                            "Pick at least one, or skip this step."
                          }
                        >
                          {/* biome-ignore lint/a11y/useSemanticElements: a group of toggles */}
                          <div
                            role="group"
                            aria-label="Use cases"
                            data-missing={flagged("useCases") || undefined}
                            className="flex flex-wrap gap-1.5"
                          >
                            {ONBOARDING_USE_CASES.map((option) => {
                              const on = answers.useCases.includes(
                                option.value,
                              );
                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  aria-pressed={on}
                                  onClick={() => toggleUseCase(option.value)}
                                  className={cn(
                                    "h-7 cursor-pointer rounded-full border px-2.5 text-[13px]/4 outline-none transition-[color,background-color,border-color,scale] duration-150 focus-visible:outline-2 focus-visible:outline-ds-ring focus-visible:outline-offset-2 active:scale-[0.97] motion-reduce:active:scale-100",
                                    on
                                      ? "border-transparent bg-ds-inverse text-ds-inverse-text"
                                      : "border-ds-border-strong text-ds-secondary hover:border-ds-border-hover hover:text-ds-text",
                                  )}
                                >
                                  {option.label}
                                </button>
                              );
                            })}
                          </div>
                        </Field>
                      )}

                      {step === 3 && (
                        <Field
                          error={flagged("source") && "Choose one, or skip."}
                        >
                          <Choices
                            label="Where did you hear about us?"
                            value={answers.source}
                            options={ONBOARDING_SOURCES}
                            onChange={(source) => set({ source })}
                            invalid={flagged("source")}
                          />
                        </Field>
                      )}
                    </div>
                  </motion.div>
                </AnimatePresence>
              </StepFrame>
            </div>

            <div className="mt-6 flex gap-2">
              {step > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => go(step - 1)}
                >
                  Back
                </Button>
              )}
              {step >= 2 && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={saving}
                  onClick={skip}
                >
                  Skip
                </Button>
              )}
              {/* aria-disabled, not disabled: a click on an incomplete step
                  points at what is missing instead of doing nothing. */}
              <Button
                type="submit"
                className="pointer-events-auto! flex-1"
                aria-disabled={!canContinue || saving}
              >
                {saving && <Spinner className="size-3.5" />}
                {step === STEPS - 1 ? "Open the dashboard" : "Continue"}
              </Button>
            </div>

            {step === STEPS - 1 && note && (
              <p className="mt-4 text-[12.5px]/[18px] text-ds-faint text-pretty">
                {note}
              </p>
            )}
          </form>
        </div>

        <p className="pb-6 text-center text-[12px]/4 text-ds-faint">
          © Openinary {new Date().getFullYear()}
        </p>
      </div>
    </MotionConfig>
  );
}
