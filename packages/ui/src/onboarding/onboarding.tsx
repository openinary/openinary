"use client";

import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  CornerDownLeft,
  ImageIcon,
  KeyRound,
  Plus,
  Upload,
  User,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { celebrate } from "../lib/celebrate";
import { cn } from "../lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Spinner } from "../ui/spinner";

import {
  type OnboardingStepId,
  type OnboardingVariant,
  onboardingSteps,
} from "./steps";

export { onboardingSteps, type OnboardingStepId, type OnboardingVariant };

export type OnboardingInviteRole = "member" | "admin";

export interface OnboardingInvite {
  email: string;
  role: OnboardingInviteRole;
}

export interface OnboardingAnswers {
  /** "My team" on the first step. Always false for someone joining. */
  team: boolean;
  /** Who they are (solo) or how big the team is: a slug, "invited" when joining. */
  role: string;
  /** 128px square data URL, or null for none. */
  image: string | null;
  name: string;
  /** The team's name, asked when `team`. */
  teamName: string;
  /** Solo: cloud's bucket, or the self-hosted workspace. */
  workspaceName: string;
  /** Self-hosted only: 128px square data URL, or null for the default mark. */
  workspaceLogo: string | null;
  useCases: string[];
  /** Null when the step was skipped. */
  source: string | null;
  /** Cloud, team: filled rows only once onComplete gets them. */
  invites: OnboardingInvite[];
  /** Self-hosted, team: open Settings › Users once done. */
  thenAddPeople: boolean;
}

/** One card on cloud's plan step. Built by the caller from @openinary/plans. */
export interface OnboardingPlan {
  id: string;
  name: string;
  badge?: string;
  price: string;
  priceNote: string;
  note: string;
  features: ReactNode[];
  /** Picking it goes through onUpgrade (a checkout) rather than straight on. */
  paid: boolean;
  /** The account is on it already. */
  current: boolean;
  cta: string;
}

export interface OnboardingProps {
  variant: OnboardingVariant;
  user: { name?: string | null; image?: string | null };
  /** The solo workspace (cloud: the active bucket). No name derives one from the user's. */
  workspace: { name?: string; logo?: string | null };
  /**
   * Set when this person joins a workspace someone else runs (cloud: a team
   * they were invited to; self-hosted: anyone but an admin). They are shown
   * it and only asked about themselves.
   */
  joining?: { name: string; logo?: string | null; detail: string };
  /** Cloud: the plan step's cards. Without them there is no plan step. */
  plans?: OnboardingPlan[];
  /** Cloud: people the current plan allows, owner included. */
  seatLimit?: number;
  /** Cloud: asks for more seats than the plan has (opens the support chat). */
  onMoreSeats?: () => void;
  /** Self-hosted: the single sign-on providers this instance has set up. */
  providers?: { id: string; name: string }[];
  /** Picks up where a checkout left off. */
  resume?: { answers: OnboardingAnswers; step: OnboardingStepId };
  /** Shown under the source step, e.g. where the answers go. */
  note?: ReactNode;
  /**
   * A paid plan was picked. `next` is the step to come back to, or null when
   * the plan step was the last one and the answers are final. A throw keeps
   * the user on the step with a toast.
   */
  onUpgrade?: (
    answers: OnboardingAnswers,
    next: OnboardingStepId | null,
  ) => Promise<void>;
  /** Persists the answers. A throw keeps the user on the last step with a toast. */
  onComplete: (answers: OnboardingAnswers) => Promise<void>;
  /** Fires each time a step is left forwards, for analytics. */
  onStepComplete?: (
    step: OnboardingStepId,
    index: number,
    answers: OnboardingAnswers,
    skipped: boolean,
  ) => void;
}

// Values are what gets stored and tracked, so they stay stable slugs even when
// a label is reworded. The team sizes keep the slugs the single role question
// used before "Just me" and "My team" split it.
export const ONBOARDING_SOLO_ROLES = [
  { value: "student", label: "Student" },
  { value: "solo", label: "Solo developer" },
  { value: "freelancer", label: "Freelancer" },
  { value: "exploring", label: "Just exploring" },
];

export const ONBOARDING_TEAM_SIZES = [
  { value: "startup", label: "2 to 10" },
  { value: "growing", label: "11 to 50" },
  { value: "enterprise", label: "51 or more" },
  { value: "agency", label: "Agency for clients" },
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

/** The role an invited person's answers are filed under. */
export const ONBOARDING_JOINING_ROLE = "invited";

const AUTH_DOCS_URL = "https://openinary.dev/docs/configuration/authentication";

const COPY = {
  cloud: {
    noun: "Openinary",
    soloDescription: "Your media, your keys",
    teamDescription: "Shared buckets, files and keys",
    workspaceLabel: "Bucket name",
    workspaceHint: "Buckets keep projects apart. You can add more later.",
    teamHint: "Your team sees this name in the account switcher and in invitation emails.",
    defaultName: (first: string) => `${first}'s bucket`,
  },
  "self-hosted": {
    noun: "this instance",
    soloDescription: "One account, your media",
    teamDescription: "Accounts, roles and single sign-on",
    workspaceLabel: "Workspace name",
    workspaceHint: "Shown in the sidebar. Change it anytime in Settings › Workspace.",
    teamHint: "The name and logo show in the sidebar for everyone on this instance.",
    defaultName: (first: string) => `${first}'s workspace`,
  },
} satisfies Record<OnboardingVariant, unknown>;

// Deliberately loose: the server checks the address, this only catches typos.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  // Off again once played, so a field fixed since doesn't keep the look.
  element.addEventListener(
    "animationend",
    () => element.classList.remove("ds-shake"),
    { once: true },
  );
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

const raisedClass =
  "cursor-pointer bg-(--ds-raised) shadow-(--ds-raised-shadow) outline-none transition-[color,background-color,box-shadow,scale] duration-150 focus-visible:outline-2 focus-visible:outline-ds-ring focus-visible:outline-offset-2 active:scale-[0.985] motion-reduce:active:scale-100";
const choiceClass = cn(
  raisedClass,
  "flex min-h-9 items-center justify-between gap-2 rounded-[9px] px-3 py-2 text-left text-[13px]/4 text-ds-secondary hover:text-ds-text",
);
const choiceOnClass =
  "bg-ds-subtle text-ds-text shadow-[inset_0_1px_2px_rgb(0_0_0/0.08),0_0_0_1px_var(--ds-ring)]";

/**
 * A few raised options, the picked ones ringed: radios by default, toggles
 * with `multiple`. A grid of rows, or pills that wrap.
 */
function Choices({
  label,
  options,
  isOn,
  onPick,
  invalid,
  multiple = false,
  wrap = false,
}: {
  label: string;
  options: { value: string; label: string }[];
  isOn: (value: string) => boolean;
  onPick: (value: string) => void;
  invalid?: boolean;
  multiple?: boolean;
  wrap?: boolean;
}) {
  return (
    <div
      role={multiple ? "group" : "radiogroup"}
      aria-label={label}
      aria-invalid={invalid || undefined}
      data-missing={invalid || undefined}
      className={
        wrap
          ? "flex flex-wrap gap-1.5"
          : "grid grid-cols-1 gap-1.5 sm:grid-cols-2"
      }
    >
      {options.map((option) => {
        const on = isOn(option.value);
        return (
          // biome-ignore lint/a11y/useSemanticElements: a styled radio or toggle
          <button
            key={option.value}
            type="button"
            role={multiple ? undefined : "radio"}
            aria-checked={multiple ? undefined : on}
            aria-pressed={multiple ? on : undefined}
            onClick={() => onPick(option.value)}
            className={cn(choiceClass, wrap && "min-h-8", on && choiceOnClass)}
          >
            {option.label}
            {on && !wrap && (
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

/** "Just me" or "My team": two big cards with an icon and a radio dot. */
function WhoOption({
  on,
  title,
  description,
  icon,
  onClick,
}: {
  on: boolean;
  title: string;
  description: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a styled radio card
    <button
      type="button"
      role="radio"
      aria-checked={on}
      aria-label={`${title}: ${description}`}
      onClick={onClick}
      className={cn(
        raisedClass,
        "relative flex flex-col items-start gap-2.5 rounded-[12px] p-3.5 text-left",
        on && "bg-ds-subtle shadow-[0_0_0_1.5px_var(--ds-ring)]",
      )}
    >
      <span
        className={cn(
          "flex size-7 items-center justify-center rounded-[8px] bg-ds-hover text-ds-secondary inset-ring inset-ring-ds-border [&_svg]:size-3.5",
          on && "bg-(--ds-raised) text-ds-blue",
        )}
      >
        {icon}
      </span>
      <span>
        <span className="block font-semibold text-[13.5px]/[18px] text-ds-text">
          {title}
        </span>
        <span className="mt-0.5 block text-[12.5px]/[17px] text-ds-muted">
          {description}
        </span>
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-3.5 right-3.5 size-4 rounded-full border-[1.5px] border-ds-border-hover bg-(--ds-raised) transition-[border-width,border-color] duration-150",
          on && "border-[5px] border-ds-blue",
        )}
      />
    </button>
  );
}

/** A square image with a small upload badge, opening a file picker. */
function AvatarPicker({
  id,
  label,
  value,
  fallback,
  round,
  onChange,
}: {
  id: string;
  label: string;
  value: string | null;
  fallback: ReactNode;
  round?: boolean;
  onChange: (value: string | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label={label}
        onClick={() => input.current?.click()}
        className={cn(
          "flex size-12 cursor-pointer items-center justify-center overflow-hidden bg-ds-avatar font-semibold text-[18px] text-ds-secondary outline-none inset-ring inset-ring-ds-border focus-visible:outline-2 focus-visible:outline-ds-ring focus-visible:outline-offset-2",
          round ? "rounded-full" : "rounded-[12px]",
        )}
      >
        {value ? (
          <img src={value} alt="" className="size-full object-cover" />
        ) : (
          fallback
        )}
      </button>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-0.5 -bottom-0.5 flex size-5 items-center justify-center rounded-[7px] bg-(--ds-raised) text-ds-secondary shadow-(--ds-raised-shadow)"
      >
        <Upload className="size-2.5" strokeWidth={2.4} />
      </span>
      <input
        ref={input}
        id={id}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="sr-only"
        onChange={async (e) => {
          const file = e.target.files?.[0];
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

const initial = (name: string) => name.trim().charAt(0).toUpperCase() || "?";

/** The workspace someone joins: its logo, name and what they join as. */
function JoiningCard({
  joining,
}: {
  joining: NonNullable<OnboardingProps["joining"]>;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[12px] bg-ds-hover px-3 py-3 inset-ring inset-ring-ds-border">
      <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-[9px] bg-ds-panel font-semibold text-[14px] text-ds-secondary inset-ring inset-ring-ds-border">
        {joining.logo ? (
          <img src={joining.logo} alt="" className="size-full object-cover" />
        ) : (
          initial(joining.name)
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate font-medium text-[14px]/5">{joining.name}</p>
        <p className="text-[12.5px]/[18px] text-ds-muted">{joining.detail}</p>
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  highlighted,
  busy,
  disabled,
  onPick,
}: {
  plan: OnboardingPlan;
  highlighted: boolean;
  busy: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-[14px] bg-(--ds-raised) shadow-(--ds-raised-shadow)",
        highlighted && "shadow-[0_0_0_1.5px_var(--ds-ring)]",
      )}
    >
      <div className="border-ds-divider border-b px-4.5 pt-4.5 pb-4">
        <p className="flex items-center gap-2 font-semibold text-[13px] text-ds-secondary">
          {plan.name}
          {plan.badge && (
            <span className="rounded-full bg-ds-blue/10 px-1.5 font-medium text-[11.5px]/[18px] text-ds-blue">
              {plan.badge}
            </span>
          )}
          {plan.current && (
            <span className="rounded-full bg-ds-hover px-1.5 font-medium text-[11.5px]/[18px] text-ds-muted">
              Current
            </span>
          )}
        </p>
        <p className="mt-2.5 font-semibold text-[28px]/8 tracking-[-0.02em]">
          {plan.price}{" "}
          <span className="font-normal text-[13px] text-ds-muted tracking-normal">
            {plan.priceNote}
          </span>
        </p>
        <p className="mt-1 text-[12.5px]/[18px] text-ds-muted">{plan.note}</p>
      </div>
      <ul className="flex flex-1 flex-col gap-2 px-4.5 py-3.5 text-[13px]/[18px] text-ds-secondary">
        {plan.features.map((feature, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed list
          <li key={i} className="flex gap-2">
            <Check className="mt-0.5 size-3.5 shrink-0 text-ds-muted" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <div className="px-4.5 pb-4.5">
        <Button
          type="button"
          variant={highlighted ? "default" : "outline"}
          className="w-full"
          disabled={disabled}
          onClick={onPick}
        >
          {busy && <Spinner className="size-3.5" />}
          {plan.cta}
        </Button>
      </div>
    </div>
  );
}

/** A row on the self-hosted team step: icon, what it is, one action. */
function AccessRow({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: ReactNode;
  description: string;
  action: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 border-ds-divider border-t px-3.5 py-3 first:border-t-0">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-ds-hover text-ds-secondary inset-ring inset-ring-ds-border [&_svg]:size-3.5">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-medium text-[13.5px]/[18px]">
          {title}
        </p>
        <p className="mt-0.5 text-[12.5px]/[17px] text-ds-muted">
          {description}
        </p>
      </div>
      {action}
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

const BLANK_INVITE: OnboardingInvite = { email: "", role: "member" };

/**
 * First-run questionnaire, shared by cloud and self-hosted: one card, a few
 * short steps, a segmented progress bar. The first step asks whether this is
 * for one person or a team, and the last ones set the team up (cloud: the
 * plan and invitations; self-hosted: how people sign in). Someone joining a
 * workspace another person runs only answers the questions about themselves.
 *
 * Continue stays clickable when an answer is missing, so the click can point
 * at it. Persisting and tracking the answers is the caller's job
 * (onComplete), since the two products store them in different places.
 */
export function Onboarding({
  variant,
  user,
  workspace,
  joining,
  plans,
  seatLimit,
  onMoreSeats,
  providers,
  resume,
  note,
  onUpgrade,
  onComplete,
  onStepComplete,
}: OnboardingProps) {
  const copy = COPY[variant];
  const form = useRef<HTMLFormElement>(null);
  const [answers, setAnswers] = useState<OnboardingAnswers>(
    () =>
      resume?.answers ?? {
        team: false,
        role: joining ? ONBOARDING_JOINING_ROLE : "",
        image: user.image ?? null,
        name: user.name ?? "",
        teamName: "",
        workspaceName:
          workspace.name ??
          (user.name?.trim() ? copy.defaultName(user.name.trim().split(/\s+/)[0]) : ""),
        workspaceLogo: workspace.logo ?? null,
        useCases: [],
        source: null,
        invites: [],
        thenAddPeople: false,
      },
  );
  const steps = onboardingSteps(variant, {
    team: answers.team,
    joining: !!joining,
    plans: !!plans?.length,
    canInvite: seatLimit === undefined || seatLimit > 1,
  });
  // Back from a checkout: the step it left for, or the plan step again when
  // that step isn't there (the checkout was abandoned, so still on Free).
  const [index, setIndex] = useState(() => {
    if (!resume) return 0;
    const at = steps.indexOf(resume.step);
    return at >= 0 ? at : Math.max(0, steps.indexOf("plan"));
  });
  const step = steps[index] ?? steps[0];
  const last = index === steps.length - 1;
  // Seats left once the owner is counted: as many invite rows as the plan
  // can take, so nobody types an address that would be refused.
  const freeSeats = seatLimit === undefined ? Infinity : seatLimit - 1;
  // Rows being typed on the invite step, blanks included.
  const [inviteRows, setInviteRows] = useState<OnboardingInvite[]>(() =>
    resume?.answers.invites.length
      ? resume.answers.invites.slice(0, Math.max(1, freeSeats))
      : Array.from({ length: Math.max(1, Math.min(2, freeSeats)) }, () => ({
          ...BLANK_INVITE,
        })),
  );
  const firstRows = useRef(inviteRows.length);
  const [direction, setDirection] = useState(1);
  // The step Continue was last pressed on with something missing.
  const [tried, setTried] = useState<OnboardingStepId | null>(null);
  const [saving, setSaving] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const set = (patch: Partial<OnboardingAnswers>) =>
    setAnswers((current) => ({ ...current, ...patch }));

  const filledInvites = inviteRows.filter((row) => row.email.trim());
  const missing = {
    role: step === "who" && !answers.role,
    teamName:
      (step === "who" || step === "profile") &&
      answers.team &&
      !answers.teamName.trim(),
    name: step === "profile" && !answers.name.trim(),
    workspaceName:
      step === "profile" &&
      !joining &&
      !answers.team &&
      !answers.workspaceName.trim(),
    useCases: step === "use_cases" && answers.useCases.length === 0,
    source: step === "source" && !answers.source,
    invites:
      step === "invite" &&
      (filledInvites.some((row) => !EMAIL.test(row.email.trim())) ||
        filledInvites.length > freeSeats),
  };
  const canContinue = !Object.values(missing).some(Boolean);
  const flagged = (field: keyof typeof missing) =>
    tried === step && missing[field];

  const go = (next: number) => {
    setDirection(next > index ? 1 : -1);
    setIndex(next);
  };

  const finalAnswers = (
    current: OnboardingAnswers,
    invites = filledInvites,
  ): OnboardingAnswers => ({
    ...current,
    name: current.name.trim(),
    teamName: current.teamName.trim(),
    workspaceName: current.workspaceName.trim(),
    invites: current.team
      ? invites.map((row) => ({ ...row, email: row.email.trim() }))
      : [],
  });

  const finish = async (
    final: OnboardingAnswers,
    invites = filledInvites,
  ) => {
    setSaving(true);
    try {
      await onComplete(finalAnswers(final, invites));
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

  const advance = (final: OnboardingAnswers, skipped = false) => {
    onStepComplete?.(step, index, final, skipped);
    if (last) return void finish(final);
    go(index + 1);
  };

  const submit = () => {
    // The plan step moves on through its cards, never a bare Enter.
    if (saving || upgrading || step === "plan") return;
    if (canContinue) return void advance(answers);
    setTried(step);
    // After the render that marks what is missing.
    requestAnimationFrame(() =>
      shake(form.current?.querySelector<HTMLElement>("[data-missing]")),
    );
  };

  // Enter continues wherever focus is, as the key on Continue promises: on a
  // picked option, on nothing at all, or in a field (where the form would
  // submit on its own, so the default is stopped to avoid a double submit).
  // Links, selects and the other buttons (Back, Skip, Add another...) keep
  // their own Enter.
  const submitRef = useRef(submit);
  submitRef.current = submit;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key !== "Enter" ||
        e.isComposing ||
        e.repeat ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        e.shiftKey
      ) {
        return;
      }
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target?.closest("a, select, textarea")) return;
      if (
        target instanceof HTMLButtonElement &&
        target.type === "button" &&
        !target.closest('[role="radiogroup"], [role="group"]')
      ) {
        return;
      }
      e.preventDefault();
      submitRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const skip = () => {
    const patch: Partial<OnboardingAnswers> =
      step === "use_cases"
        ? { useCases: [] }
        : step === "source"
          ? { source: null }
          : {};
    const final = { ...answers, ...patch };
    set(patch);
    if (step === "invite") {
      onStepComplete?.(step, index, final, true);
      return void finish(final, []);
    }
    advance(final, true);
  };

  const pickPlan = async (plan: OnboardingPlan) => {
    if (!plan.paid || plan.current || !onUpgrade) return advance(answers);
    onStepComplete?.(step, index, answers, false);
    setUpgrading(true);
    try {
      // On Free a team has no invite step yet; paying adds the seats for it.
      const next =
        steps[index + 1] ??
        (answers.team && variant === "cloud" ? "invite" : null);
      await onUpgrade(finalAnswers(answers), next);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not open the checkout",
      );
      setUpgrading(false);
    }
  };

  const toggleUseCase = (value: string) =>
    set({
      useCases: answers.useCases.includes(value)
        ? answers.useCases.filter((v) => v !== value)
        : [...answers.useCases, value],
    });

  const setInvite = (i: number, patch: Partial<OnboardingInvite>) =>
    setInviteRows((rows) =>
      rows.map((row, j) => (j === i ? { ...row, ...patch } : row)),
    );

  const teamLabel = answers.teamName.trim() || "your team";
  const [title, subtitle] = (
    {
      who: [
        `Who is ${copy.noun} for?`,
        "You can invite people later either way.",
      ],
      profile: joining
        ? [
            `Welcome to ${joining.name}`,
            "Tell your teammates who you are.",
          ]
        : [
            "What should we call you?",
            answers.team
              ? "Your team sees this next to what you upload."
              : "So the dashboard knows what to call you.",
          ],
      use_cases: [
        joining
          ? "What will you use Openinary for?"
          : answers.team
            ? `What is ${teamLabel} building?`
            : "What are you building?",
        "Pick everything you'd use Openinary for. You can change this later.",
      ],
      source: [
        "Where did you hear about us?",
        "One click, and it helps a solo founder a lot.",
      ],
      plan: [
        answers.team ? `Pick a plan for ${teamLabel}` : "Pick a plan",
        "Both start at $0. Pay as you go only bills what you use past the included amounts.",
      ],
      invite: [
        `Invite your team to ${teamLabel}`,
        "They get an email and join with the role you pick. Admins manage people and settings, members upload and organise media.",
      ],
      team_access: [
        `Bring ${teamLabel} onto this instance`,
        "Everyone signs in to your instance. Pick how they get in, you can do the rest later from Settings › Users.",
      ],
    } satisfies Record<OnboardingStepId, [string, string]>
  )[step];

  const primaryLabel =
    step === "invite" && filledInvites.length > 0
      ? `Send ${filledInvites.length} ${filledInvites.length === 1 ? "invite" : "invites"}`
      : last
        ? "Open the dashboard"
        : "Continue";
  const skippable =
    step === "use_cases" || step === "source" || step === "invite";
  const busy = saving || upgrading;
  const paidPlan = plans?.find((p) => p.paid);
  const highlightedPlan =
    plans?.find((p) => p.current && p.paid)?.id ??
    (answers.team ? paidPlan?.id : plans?.find((p) => !p.paid)?.id);

  return (
    <MotionConfig reducedMotion="user">
      <div className={BACKDROP_CLASS} style={{ backgroundImage: SKY }}>
        <div
          className={cn(
            "ds-rise mx-auto flex w-full flex-1 flex-col justify-center px-4 py-10 transition-[max-width] duration-300 ease-swap",
            step === "plan"
              ? "max-w-[720px]"
              : step === "invite" || step === "team_access"
                ? "max-w-[520px]"
                : "max-w-[460px]",
          )}
        >
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
                aria-valuemax={steps.length}
                aria-valuenow={index + 1}
                className="flex flex-1 gap-1.5"
              >
                {steps.map((id, i) => (
                  <div
                    key={id}
                    className={cn(
                      "h-[3px] flex-1 rounded-full transition-colors duration-300",
                      i <= index ? "bg-ds-blue" : "bg-ds-border-strong",
                    )}
                  />
                ))}
              </div>
              <span className="shrink-0 text-[12.5px]/4 text-ds-muted tabular-nums">
                Step {index + 1} of {steps.length}
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
                      {step === "who" && (
                        <>
                          <div
                            role="radiogroup"
                            aria-label={`Who is ${copy.noun} for?`}
                            className="grid grid-cols-2 gap-2"
                          >
                            <WhoOption
                              on={!answers.team}
                              title="Just me"
                              description={copy.soloDescription}
                              icon={<User />}
                              onClick={() =>
                                answers.team && set({ team: false, role: "" })
                              }
                            />
                            <WhoOption
                              on={answers.team}
                              title="My team"
                              description={copy.teamDescription}
                              icon={<Users />}
                              onClick={() =>
                                !answers.team && set({ team: true, role: "" })
                              }
                            />
                          </div>
                          {answers.team && (
                            <Field
                              label="Team name"
                              htmlFor="onboarding-team"
                              error={flagged("teamName") && "Give it a name."}
                            >
                              <Input
                                id="onboarding-team"
                                autoFocus
                                maxLength={60}
                                placeholder="Acme"
                                value={answers.teamName}
                                data-missing={flagged("teamName") || undefined}
                                data-invalid={flagged("teamName") || undefined}
                                onChange={(e) =>
                                  set({ teamName: e.target.value })
                                }
                              />
                            </Field>
                          )}
                          <Field
                            label={
                              answers.team
                                ? "How many people?"
                                : "What best describes you?"
                            }
                            error={flagged("role") && "Choose one."}
                          >
                            <Choices
                              wrap
                              label={
                                answers.team
                                  ? "How many people?"
                                  : "What best describes you?"
                              }
                              options={
                                answers.team
                                  ? ONBOARDING_TEAM_SIZES
                                  : ONBOARDING_SOLO_ROLES
                              }
                              isOn={(value) => answers.role === value}
                              onPick={(role) => set({ role })}
                              invalid={flagged("role")}
                            />
                          </Field>
                        </>
                      )}

                      {step === "profile" && (
                        <>
                          {joining && <JoiningCard joining={joining} />}
                          <div className="flex items-end gap-3">
                            <AvatarPicker
                              id="onboarding-avatar"
                              label="Change profile picture"
                              round
                              value={answers.image}
                              fallback={initial(answers.name)}
                              onChange={(image) => set({ image })}
                            />
                            <div className="min-w-0 flex-1">
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
                                  onChange={(e) =>
                                    set({ name: e.target.value })
                                  }
                                />
                              </Field>
                            </div>
                          </div>
                          {!joining && (
                            <>
                              <div className="flex items-end gap-3">
                                {variant === "self-hosted" ? (
                                  <AvatarPicker
                                    id="onboarding-logo"
                                    label="Change logo"
                                    value={answers.workspaceLogo}
                                    fallback={initial(
                                      answers.team
                                        ? answers.teamName
                                        : answers.workspaceName,
                                    )}
                                    onChange={(workspaceLogo) =>
                                      set({ workspaceLogo })
                                    }
                                  />
                                ) : (
                                  <span className="flex size-12 shrink-0 items-center justify-center rounded-[12px] bg-ds-hover font-semibold text-[18px] text-ds-secondary inset-ring inset-ring-ds-border">
                                    {answers.team ? (
                                      initial(answers.teamName)
                                    ) : (
                                      <ImageIcon className="size-5" />
                                    )}
                                  </span>
                                )}
                                <div className="min-w-0 flex-1">
                                  {answers.team ? (
                                    <Field
                                      label="Team name"
                                      htmlFor="onboarding-team"
                                      error={
                                        flagged("teamName") && "Give it a name."
                                      }
                                    >
                                      <Input
                                        id="onboarding-team"
                                        maxLength={60}
                                        value={answers.teamName}
                                        data-missing={
                                          flagged("teamName") || undefined
                                        }
                                        data-invalid={
                                          flagged("teamName") || undefined
                                        }
                                        onChange={(e) =>
                                          set({ teamName: e.target.value })
                                        }
                                      />
                                    </Field>
                                  ) : (
                                    <Field
                                      label={copy.workspaceLabel}
                                      htmlFor="onboarding-workspace"
                                      error={
                                        flagged("workspaceName") &&
                                        "Give it a name."
                                      }
                                    >
                                      <Input
                                        id="onboarding-workspace"
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
                                  )}
                                </div>
                              </div>
                              <p className="text-[12.5px]/[18px] text-ds-muted text-pretty">
                                {answers.team ? copy.teamHint : copy.workspaceHint}
                              </p>
                            </>
                          )}
                        </>
                      )}

                      {step === "use_cases" && (
                        <Field
                          error={
                            flagged("useCases") &&
                            "Pick at least one, or skip this step."
                          }
                        >
                          <Choices
                            multiple
                            label="Use cases"
                            options={ONBOARDING_USE_CASES}
                            isOn={(value) => answers.useCases.includes(value)}
                            onPick={toggleUseCase}
                            invalid={flagged("useCases")}
                          />
                        </Field>
                      )}

                      {step === "source" && (
                        <>
                          <Field
                            error={flagged("source") && "Choose one, or skip."}
                          >
                            <Choices
                              label="Where did you hear about us?"
                              options={ONBOARDING_SOURCES}
                              isOn={(value) => answers.source === value}
                              onPick={(source) => set({ source })}
                              invalid={flagged("source")}
                            />
                          </Field>
                          {note && (
                            <p className="text-[12.5px]/[18px] text-ds-muted text-pretty">
                              {note}
                            </p>
                          )}
                        </>
                      )}

                      {step === "plan" && plans && (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {plans.map((plan) => (
                            <PlanCard
                              key={plan.id}
                              plan={plan}
                              highlighted={plan.id === highlightedPlan}
                              busy={upgrading && plan.paid}
                              disabled={busy}
                              onPick={() => void pickPlan(plan)}
                            />
                          ))}
                          {answers.team && seatLimit === 1 && (
                            <p className="text-center text-[12.5px]/[18px] text-ds-muted text-pretty sm:col-span-2">
                              On Free it's just you. Enable pay as you go to
                              invite your team, now or later from Settings ›
                              Team.
                            </p>
                          )}
                        </div>
                      )}

                      {step === "invite" && (
                        <>
                          <div className="flex flex-col gap-1.5">
                            {inviteRows.map((row, i) => {
                              const bad =
                                tried === "invite" &&
                                !!row.email.trim() &&
                                !EMAIL.test(row.email.trim());
                              return (
                                <div
                                  // biome-ignore lint/suspicious/noArrayIndexKey: rows have no id until sent
                                  key={i}
                                  className="grid grid-cols-[minmax(0,1fr)_112px_28px] items-center gap-1.5"
                                >
                                  <Input
                                    type="email"
                                    aria-label={`Email ${i + 1}`}
                                    // The first row on arrival, then each row "Add another" adds.
                                    autoFocus={i === 0 || i >= firstRows.current}
                                    placeholder="teammate@company.com"
                                    value={row.email}
                                    data-missing={bad || undefined}
                                    data-invalid={bad || undefined}
                                    onChange={(e) =>
                                      setInvite(i, { email: e.target.value })
                                    }
                                  />
                                  <select
                                    aria-label={`Role ${i + 1}`}
                                    value={row.role}
                                    onChange={(e) =>
                                      setInvite(i, {
                                        role: e.target
                                          .value as OnboardingInviteRole,
                                      })
                                    }
                                    className="h-8 w-full cursor-pointer rounded-[8px] border border-ds-border-strong bg-ds-field px-2 text-[13px] text-ds-text outline-none focus-visible:border-ds-ring focus-visible:ring-[3px] focus-visible:ring-ds-ring/20"
                                  >
                                    <option value="member">Member</option>
                                    <option value="admin">Admin</option>
                                  </select>
                                  <button
                                    type="button"
                                    aria-label={`Remove row ${i + 1}`}
                                    disabled={inviteRows.length === 1}
                                    onClick={() =>
                                      setInviteRows((rows) =>
                                        rows.filter((_, j) => j !== i),
                                      )
                                    }
                                    className="flex size-7 cursor-pointer items-center justify-center rounded-[8px] text-ds-muted outline-none hover:bg-ds-hover hover:text-ds-text focus-visible:outline-2 focus-visible:outline-ds-ring disabled:pointer-events-none disabled:opacity-40"
                                  >
                                    <X className="size-3.5" />
                                  </button>
                                </div>
                              );
                            })}
                            {inviteRows.length < freeSeats && (
                            <button
                              type="button"
                              onClick={() =>
                                setInviteRows((rows) => [
                                  ...rows,
                                  { ...BLANK_INVITE },
                                ])
                              }
                              className="inline-flex h-7.5 cursor-pointer items-center gap-1.5 self-start rounded-[8px] px-2 font-medium text-[13px] text-ds-blue outline-none hover:bg-ds-hover focus-visible:outline-2 focus-visible:outline-ds-ring"
                            >
                              <Plus className="size-3.5" />
                              Add another
                            </button>
                            )}
                          </div>
                          {seatLimit !== undefined && (
                            <div
                              className={cn(
                                "flex items-center justify-between gap-3 rounded-[10px] bg-ds-hover px-3 py-2.5 text-[12.5px]/[18px] inset-ring inset-ring-ds-border",
                                filledInvites.length > freeSeats
                                  ? "text-ds-red"
                                  : "text-ds-secondary",
                              )}
                              role={
                                filledInvites.length > freeSeats
                                  ? "alert"
                                  : undefined
                              }
                            >
                              <span>
                                {filledInvites.length > freeSeats
                                  ? seatLimit === 1
                                    ? "Your plan has one seat, yours. Enable pay as you go to invite people."
                                    : `Your plan has ${seatLimit} seats, you included. Remove ${filledInvites.length - freeSeats} to continue.`
                                  : `${1 + filledInvites.length} of ${seatLimit} seats, you included`}
                              </span>
                              <span aria-hidden="true" className="flex gap-[3px]">
                                {Array.from({ length: seatLimit }, (_, i) => (
                                  <i
                                    // biome-ignore lint/suspicious/noArrayIndexKey: fixed length
                                    key={i}
                                    className={cn(
                                      "block h-1.5 w-3.5 rounded-[2px]",
                                      i < 1 + filledInvites.length
                                        ? "bg-ds-blue"
                                        : "bg-ds-border-strong",
                                    )}
                                  />
                                ))}
                              </span>
                            </div>
                          )}
                          {onMoreSeats &&
                            seatLimit !== undefined &&
                            inviteRows.length >= freeSeats && (
                              <p className="text-[12.5px]/[18px] text-ds-muted">
                                Need more seats?{" "}
                                <button
                                  type="button"
                                  onClick={onMoreSeats}
                                  className="cursor-pointer text-ds-text underline underline-offset-2"
                                >
                                  Contact us
                                </button>
                                .
                              </p>
                            )}
                        </>
                      )}

                      {step === "team_access" && (
                        <div className="overflow-hidden rounded-[12px] bg-(--ds-raised) shadow-(--ds-raised-shadow)">
                          <AccessRow
                            icon={<KeyRound />}
                            title={
                              <>
                                Single sign-on
                                <span
                                  className={cn(
                                    "rounded-full px-1.5 font-medium text-[11.5px]/[18px]",
                                    providers?.length
                                      ? "bg-ds-green/10 text-ds-green"
                                      : "bg-ds-hover text-ds-muted",
                                  )}
                                >
                                  {providers?.length
                                    ? providers.map((p) => p.name).join(", ")
                                    : "Not set up"}
                                </span>
                              </>
                            }
                            description="Google Workspace, Entra, Okta or any OIDC provider"
                            action={
                              <Button asChild variant="outline" size="sm">
                                <a
                                  href={AUTH_DOCS_URL}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Guide
                                  <ArrowUpRight />
                                </a>
                              </Button>
                            }
                          />
                          <AccessRow
                            icon={<UserPlus />}
                            title="Add people"
                            description="Create accounts and pick each one's role"
                            action={
                              <Button
                                type="button"
                                size="sm"
                                disabled={busy}
                                onClick={() => {
                                  const final = { ...answers, thenAddPeople: true };
                                  set({ thenAddPeople: true });
                                  onStepComplete?.(step, index, final, false);
                                  void finish(final);
                                }}
                              >
                                Add
                              </Button>
                            }
                          />
                        </div>
                      )}
                    </div>
                  </motion.div>
                </AnimatePresence>
              </StepFrame>
            </div>

            <div className="mt-7 flex items-center justify-between gap-2">
              {index > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-ds-muted"
                  disabled={busy}
                  onClick={() => go(index - 1)}
                >
                  <ArrowLeft />
                  Back
                </Button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-1.5">
                {(skippable || step === "plan") && (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={step === "plan" ? () => advance(answers, true) : skip}
                  >
                    {step === "use_cases" || step === "source"
                      ? "Skip"
                      : "Skip for now"}
                  </Button>
                )}
                {step !== "plan" && (
                  // aria-disabled, not disabled: a click on an incomplete step
                  // points at what is missing instead of doing nothing.
                  <Button
                    type="submit"
                    className="pointer-events-auto! pr-2"
                    aria-disabled={!canContinue || busy}
                  >
                    {saving && <Spinner className="size-3.5" />}
                    {primaryLabel}
                    <kbd className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] bg-current/15 px-1 font-sans">
                      <CornerDownLeft className="size-3" />
                    </kbd>
                  </Button>
                )}
              </div>
            </div>
          </form>
        </div>

        <p className="pb-6 text-center text-[12px]/4 text-ds-faint">
          © Openinary {new Date().getFullYear()}
        </p>
      </div>
    </MotionConfig>
  );
}
