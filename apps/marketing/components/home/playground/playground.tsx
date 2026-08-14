"use client";

import * as React from "react";
import { Check, Copy, RotateCcw } from "lucide-react";

import { FileUploader } from "@/components/openinary/file-uploader";
import { focusRing, pressable } from "@/components/home/cta-button";
import { cn } from "@/lib/utils";
import {
  resolveTokens,
  themes,
  toCss,
  type Overrides,
  type Theme,
} from "@/components/home/playground/themes";

const INSTALL =
  "npx shadcn@latest add https://openinary.dev/r/file-uploader.json";

/**
 * The playground never talks to an Openinary instance. `/api/playground/upload`
 * accepts the bytes so progress, cancel and retry behave exactly like the real
 * thing, then discards them.
 */
const PLAYGROUND_API = "/api/playground";

const signPlaygroundUpload = () => ({
  signature: "playground",
  expires: Math.floor(Date.now() / 1000) + 600,
  folder: "playground",
});

function useCopy() {
  const [copied, setCopied] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(null), 1600);
    return () => clearTimeout(id);
  }, [copied]);

  return {
    copied,
    copy: async (key: string, text: string) => {
      await navigator.clipboard.writeText(text);
      setCopied(key);
    },
  };
}

export function Playground() {
  const [theme, setTheme] = React.useState<Theme>(themes[0]);
  const [mode, setMode] = React.useState<"light" | "dark">("light");
  const [overrides, setOverrides] = React.useState<Overrides>({});
  const { copied, copy } = useCopy();

  const tokens = resolveTokens(theme, mode, overrides);
  const isDirty = Object.keys(overrides).length > 0 || theme.id !== "default";

  const cssVars = Object.fromEntries(
    Object.entries(tokens).map(([key, value]) => [`--${key}`, value]),
  ) as React.CSSProperties;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px] lg:gap-6">
      {/* Canvas */}
      <div
        style={cssVars}
        className={cn(
          // text-foreground matters: the uploader's labels have no colour class
          // of their own, so without it they inherit the page colour and go
          // black-on-black the moment a dark preset is selected.
          "flex min-h-[420px] flex-col rounded-xl border border-border bg-background p-4 text-foreground transition-colors sm:p-8",
          mode === "dark" && "dark",
        )}
      >
        <p className="mb-6 font-mono text-xs text-muted-foreground">
          &lt;FileUploader /&gt;
        </p>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-md">
            <FileUploader
              baseUrl={PLAYGROUND_API}
              sign={signPlaygroundUpload}
              maxSize={10 * 1024 * 1024}
            />
          </div>
        </div>
      </div>

      {/* Controls */}
      <aside className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5">
        <div>
          <h3 className="text-sm font-medium">Theme editor</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            The component below is the one you install. Nothing you drop here is
            uploaded anywhere.
          </p>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium">Preset</span>
          <select
            value={theme.id}
            onChange={(event) => {
              setTheme(
                themes.find((t) => t.id === event.target.value) ?? themes[0],
              );
              setOverrides({});
            }}
            className={cn(
              "h-9 rounded-md border border-border bg-background px-2 text-sm transition-all",
              focusRing,
            )}
          >
            {themes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-1 rounded-md border border-border p-1">
          {(["light", "dark"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              aria-pressed={mode === value}
              className={cn(
                "h-7 rounded border border-transparent text-xs font-medium capitalize transition-all",
                focusRing,
                pressable,
                mode === value
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {value} mode
            </button>
          ))}
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium">Primary</span>
          <span className="flex h-9 items-center gap-2 rounded-md border border-border px-2">
            <input
              type="color"
              value={overrides.primary ?? tokens.primary}
              onChange={(event) =>
                setOverrides((o) => ({ ...o, primary: event.target.value }))
              }
              aria-label="Primary colour"
              className="size-5 cursor-pointer rounded border-0 bg-transparent p-0"
            />
            <span className="font-mono text-xs uppercase text-muted-foreground">
              {overrides.primary ?? tokens.primary}
            </span>
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="flex items-center justify-between text-xs font-medium">
            Radius
            <span className="font-mono text-muted-foreground">
              {tokens.radius}
            </span>
          </span>
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.125}
            value={parseFloat(tokens.radius) || 0}
            onChange={(event) =>
              setOverrides((o) => ({
                ...o,
                radius: `${event.target.value}rem`,
              }))
            }
            className="h-9 w-full accent-foreground"
          />
        </label>

        <div className="mt-auto flex flex-col gap-2 border-t border-border pt-4">
          <PanelButton
            onClick={() => copy("css", toCss(theme, overrides))}
            done={copied === "css"}
          >
            Copy CSS
          </PanelButton>
          <PanelButton
            onClick={() => copy("install", INSTALL)}
            done={copied === "install"}
          >
            Copy install command
          </PanelButton>
          <button
            type="button"
            onClick={() => {
              setTheme(themes[0]);
              setOverrides({});
              setMode("light");
            }}
            disabled={!isDirty && mode === "light"}
            className={cn(
              "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-transparent text-xs font-medium text-muted-foreground transition-all hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
              focusRing,
              pressable,
            )}
          >
            <RotateCcw className="size-3.5" aria-hidden />
            Reset to default
          </button>
        </div>
      </aside>
    </div>
  );
}

function PanelButton({
  onClick,
  done,
  children,
}: {
  onClick: () => void;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border text-xs font-medium transition-all hover:bg-muted",
        focusRing,
        pressable,
      )}
    >
      {done ? (
        <Check className="size-3.5" aria-hidden />
      ) : (
        <Copy className="size-3.5" aria-hidden />
      )}
      {done ? "Copied" : children}
    </button>
  );
}
