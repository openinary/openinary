"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ChartColumn,
  ChevronDown,
  HardDrive,
  Image as ImageIcon,
  KeyRound,
  LayoutGrid,
  Plug,
  Upload,
  UploadCloud,
  Video,
} from "lucide-react";
import { type ReactNode, useState } from "react";

import { cn } from "../lib/utils";
import type { OnboardingAnswers } from "./onboarding";

const FACTS = [
  "Every transformation is a URL. Change a parameter and the new version is ready, nothing to deploy.",
  "A transformed file is cached after its first request, so every visitor after that gets it straight from cache.",
  "Openinary is open source: the engine behind Openinary Cloud is the same one you can run on your own server.",
];

const blurIn = {
  initial: { opacity: 0, filter: "blur(8px)" },
  animate: { opacity: 1, filter: "blur(0px)" },
  exit: { opacity: 0, filter: "blur(8px)" },
  transition: { duration: 0.3, ease: "easeOut" },
} as const;

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : ""))
    .toUpperCase();
}

/** Re-mounts on `id` so each new picture lands with a small pop. */
function Pop({ id, children }: { id: string; children: ReactNode }) {
  return (
    <motion.div
      key={id}
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 22 }}
    >
      {children}
    </motion.div>
  );
}

function Bar({ className }: { className?: string }) {
  return (
    <div
      className={cn("h-2 animate-pulse rounded-full bg-foreground/10", className)}
    />
  );
}

const NAV = [LayoutGrid, ChartColumn, HardDrive, KeyRound];
const TOOLS = [
  { icon: Plug, tile: "from-orange-400 to-rose-500" },
  { icon: ImageIcon, tile: "from-sky-400 to-indigo-500" },
  { icon: Video, tile: "from-emerald-400 to-teal-600" },
  { icon: UploadCloud, tile: "from-fuchsia-400 to-violet-600" },
];
const BAR_WIDTHS = ["w-20", "w-14", "w-24", "w-16"];

/**
 * A stand-in for the dashboard, wider than the pane on purpose: step one
 * frames its top-right corner (where the user shows up), step two pans to the
 * top-left (where the workspace does), like a camera moving across it.
 */
function DashboardMock({
  step,
  answers,
  workspaceMark,
}: {
  step: number;
  answers: OnboardingAnswers;
  workspaceMark?: ReactNode;
}) {
  return (
    <motion.div {...blurIn} className="absolute inset-0">
      <div
        // 155% wide with a 3.5rem inset: -35.48% (0.55 / 1.55) minus both
        // insets puts its right edge 3.5rem from the pane's right edge.
        className="absolute top-[13%] left-14 w-[155%] transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] [mask-image:linear-gradient(to_bottom,black_40%,transparent_80%)]"
        style={{
          transform:
            step === 0 ? "translateX(calc(-35.48% - 7rem))" : "translateX(0)",
        }}
      >
        <div className="grid grid-cols-[15rem_1fr] overflow-hidden rounded-xl border bg-background shadow-2xl">
          <div className="border-r bg-sidebar pb-10">
            <div className="flex h-14 items-center gap-2 px-4">
              <div className="size-6 shrink-0 overflow-hidden rounded-md">
                <Pop id={answers.workspaceLogo ?? "mark"}>
                  {answers.workspaceLogo ? (
                    <img
                      src={answers.workspaceLogo}
                      alt=""
                      className="size-6 object-cover"
                    />
                  ) : (
                    (workspaceMark ?? <div className="size-6 bg-muted" />)
                  )}
                </Pop>
              </div>
              <span className="truncate font-medium text-sm">
                {answers.workspaceName.trim() || "Openinary"}
              </span>
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
            </div>
            <div className="px-3">
              <div className="h-8 rounded-md border bg-background/60" />
            </div>
            <div className="mt-4 flex flex-col gap-4 px-5">
              {NAV.map((Icon, i) => (
                <div key={Icon.displayName ?? i} className="flex items-center gap-3">
                  <Icon className="size-4 text-muted-foreground/60" />
                  <Bar className={BAR_WIDTHS[i]} />
                </div>
              ))}
            </div>
            <Bar className="mx-5 mt-7 w-10 opacity-60" />
            <div className="mt-4 flex flex-col gap-3.5 px-5">
              {TOOLS.map(({ icon: Icon, tile }, i) => (
                <div key={tile} className="flex items-center gap-3">
                  <span
                    className={cn(
                      "inset-ring-1 inset-ring-black/10 -mx-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-linear-to-br text-white",
                      tile,
                    )}
                  >
                    <Icon className="size-3" />
                  </span>
                  <Bar className={BAR_WIDTHS[(i + 2) % 4]} />
                </div>
              ))}
            </div>
          </div>

          <div className="min-w-0">
            <div className="flex h-14 items-center justify-between border-b px-5">
              <span className="font-medium text-sm">Assets</span>
              <div className="flex items-center gap-3">
                <div className="flex h-8 items-center gap-1.5 rounded-md border px-2.5 font-medium text-xs">
                  <Upload className="size-3.5" />
                  Upload
                </div>
                <div className="size-8 overflow-hidden rounded-full bg-muted">
                  <Pop id={answers.image ?? "initials"}>
                    {answers.image ? (
                      <img
                        src={answers.image}
                        alt=""
                        className="size-8 object-cover"
                      />
                    ) : (
                      <div className="flex size-8 items-center justify-center font-medium text-muted-foreground text-xs">
                        {initials(answers.name)}
                      </div>
                    )}
                  </Pop>
                </div>
              </div>
            </div>
            <div className="p-5">
              <Bar className="h-3 w-40" />
              <Bar className="mt-2.5 w-64 opacity-60" />
              <div className="mt-6 grid grid-cols-5 gap-3">
                {Array.from({ length: 15 }, (_, i) => (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
                    key={i}
                    className="aspect-square animate-pulse rounded-lg bg-foreground/[0.06]"
                    style={{ animationDelay: `${(i % 5) * 120}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

const COLORS = ["#f97316", "#3b82f6", "#facc15", "#d946ef", "#22c55e", "#06b6d4"];

function Shape({ kind, color }: { kind: number; color: string }) {
  const paths = [
    <path key="quad" d="M5 11 21 4l7 16-16 8Z" />,
    <path key="chevrons" d="M2 4l13 12L2 28Zm13 0 13 12-13 12Z" />,
    [0, 60, 120, 180, 240, 300].map((deg) => (
      <circle
        key={deg}
        r="5.5"
        cx={16 + 9 * Math.cos((deg * Math.PI) / 180)}
        cy={16 + 9 * Math.sin((deg * Math.PI) / 180)}
      />
    )),
    [0, 1, 2, 3, 4].flatMap((row) =>
      [0, 1, 2, 3, 4]
        .filter((col) => (row + col) % 2 === 0)
        .map((col) => (
          <rect
            key={`${row}-${col}`}
            x={4.5 + col * 4.6}
            y={4.5 + row * 4.6}
            width="4.6"
            height="4.6"
            transform="rotate(45 16 16)"
          />
        )),
    ),
    <path
      key="star"
      d="M16 1l3.5 9.5L29 7l-4.5 9L29 25l-9.5-3.5L16 31l-3.5-9.5L3 25l4.5-9L3 7l9.5 3.5Z"
    />,
    <path key="bolt" d="M18 1 5 18h9l-2 13 15-19h-9Z" />,
  ];
  return (
    <svg viewBox="0 0 32 32" className="size-full" fill={color} aria-hidden>
      {paths[kind]}
    </svg>
  );
}

// Fifteen resting spots across the floor, one per shape that can ever be on
// screen (four ambient + one per use case), so nothing lands on top of
// anything else.
const slotLeft = (slot: number) => `${5 + slot * 6.1}%`;
const AMBIENT = [
  { id: "ambient-0", kind: 0, color: 0, slot: 1 },
  { id: "ambient-1", kind: 1, color: 1, slot: 5 },
  { id: "ambient-2", kind: 2, color: 2, slot: 9 },
  { id: "ambient-3", kind: 3, color: 3, slot: 13 },
];
const USE_CASE_SLOTS = [7, 2, 11, 4, 14, 0, 8, 12, 3, 10, 6];

function Falling({
  kind,
  color,
  slot,
  ambient,
}: {
  kind: number;
  color: number;
  slot: number;
  ambient: boolean;
}) {
  const from = ambient ? "-72vh" : "-105vh";
  const duration = ambient ? 1.8 : 1.1;
  const r0 = (slot * 47) % 360;
  return (
    <motion.div
      className="absolute bottom-5 size-9"
      style={{ left: slotLeft(slot) }}
      initial={{ y: from, rotate: r0 }}
      animate={{
        y: [from, "0vh", "-3vh", "0vh", "-0.8vh", "0vh"],
        rotate: r0 + 110 + ((slot * 31) % 90),
      }}
      exit={{ opacity: 0, scale: 0.4, transition: { duration: 0.2 } }}
      transition={{
        y: {
          duration,
          times: [0, 0.6, 0.74, 0.86, 0.94, 1],
          ease: ["easeIn", "easeOut", "easeIn", "easeOut", "easeIn"],
        },
        rotate: { duration: duration * 0.8, ease: "easeOut" },
      }}
    >
      <Shape kind={kind} color={COLORS[color]} />
    </motion.div>
  );
}

/**
 * The right-hand pane: the dashboard for the first two steps, a pile of
 * shapes for the use cases (one drops per chip picked), then a fact.
 */
export function OnboardingPreview({
  step,
  answers,
  useCases,
  workspaceMark,
}: {
  step: number;
  answers: OnboardingAnswers;
  /** Every use case value, in chip order: a chip's index picks its shape. */
  useCases: string[];
  workspaceMark?: ReactNode;
}) {
  const [fact] = useState(
    () => FACTS[Math.floor(Math.random() * FACTS.length)],
  );

  return (
    <AnimatePresence>
      {step < 2 && (
        <DashboardMock
          key="dashboard"
          step={step}
          answers={answers}
          workspaceMark={workspaceMark}
        />
      )}

      {step === 2 && (
        <motion.div key="shapes" {...blurIn} className="absolute inset-0">
          <AnimatePresence>
            {AMBIENT.map((shape) => (
              <Falling key={shape.id} {...shape} ambient />
            ))}
            {useCases.map(
              (value, i) =>
                answers.useCases.includes(value) && (
                  <Falling
                    key={value}
                    kind={i % 6}
                    color={(i * 5 + 1) % 6}
                    slot={USE_CASE_SLOTS[i]}
                    ambient={false}
                  />
                ),
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {step === 3 && (
        <motion.div
          key="fact"
          {...blurIn}
          className="absolute inset-y-0 right-[18%] left-[28%] flex flex-col justify-center"
        >
          <p className="text-muted-foreground text-xs">Did you know?</p>
          <p className="mt-3 text-balance font-medium text-lg leading-snug">
            {fact}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
