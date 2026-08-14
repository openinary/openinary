"use client";

import * as React from "react";
import { Check, Copy, RotateCcw } from "lucide-react";

import { FileUploader } from "@/components/openinary/file-uploader";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ColorPicker,
  ColorPickerArea,
  ColorPickerContent,
  ColorPickerEyeDropper,
  ColorPickerHueSlider,
  ColorPickerInput,
  ColorPickerSwatch,
  ColorPickerTrigger,
} from "@/components/ui/color-picker";
import { focusRing, pressable } from "@/components/home/cta-button";
import { useCopy } from "@/hooks/use-copy";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { createSampleFiles } from "@/components/home/playground/sample-files";
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

/** "Have we hydrated yet" as a store, so it costs no effect and no setState. */
const subscribeNever = () => () => {};
const isClient = () => true;
const isServer = () => false;

const signPlaygroundUpload = () => ({
  signature: "playground",
  expires: Math.floor(Date.now() / 1000) + 600,
  folder: "playground",
});

export function Playground() {
  const [theme, setTheme] = React.useState<Theme>(themes[0]);
  const [overrides, setOverrides] = React.useState<Overrides>({});
  const { copied, copy } = useCopy();
  const presetId = React.useId();
  const canvasRef = React.useRef<HTMLDivElement>(null);
  // Bumped by Reset. The uploader owns its file list internally, so remounting
  // it is the only way to clear that from out here; the seeding effect keys off
  // the same token, which puts the sample file back.
  const [resetToken, setResetToken] = React.useState(0);

  // Hand the uploader two files on mount by way of its own file input, so it
  // reaches the same state it would from a real drop. Seeding through the
  // component's public surface rather than adding a demo-only prop keeps
  // packages/registry free of anything that exists purely for this page.
  React.useEffect(() => {
    let cancelled = false;
    const input =
      canvasRef.current?.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) return;

    void createSampleFiles().then((files) => {
      if (cancelled || files.length === 0) return;
      const transfer = new DataTransfer();
      for (const file of files) transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    return () => {
      cancelled = true;
    };
  }, [resetToken]);

  // The canvas follows the site's own light/dark until the visitor picks a side
  // for it, then stays where they put it.
  //
  // The mounted gate is load-bearing: next-themes resolves the stored theme
  // synchronously on the first client render, so reading it straight away makes
  // the client disagree with the server-rendered "light" and React bails out of
  // hydration. Staying on "light" for one render keeps the two in step, then the
  // effect swaps in the real theme.
  const { resolvedTheme } = useTheme();
  const hydrated = React.useSyncExternalStore(subscribeNever, isClient, isServer);

  const [modeOverride, setModeOverride] = React.useState<"light" | "dark" | null>(
    null,
  );
  const mode =
    modeOverride ?? (hydrated && resolvedTheme === "dark" ? "dark" : "light");

  const tokens = resolveTokens(theme, mode, overrides);

  const canvasStyle = {
    ...Object.fromEntries(
      Object.entries(tokens).map(([key, value]) => [`--${key}`, value]),
    ),
    // Dot grid keyed to the canvas's own --foreground, set just above, so it
    // tracks the selected preset instead of the site theme. background-image
    // paints over bg-background, so no extra layer is needed.
    backgroundImage:
      "radial-gradient(color-mix(in oklch, var(--foreground) 7%, transparent) 1px, transparent 1px)",
    backgroundSize: "16px 16px",
  } as React.CSSProperties;

  return (
    // Hairlines drawn by the 1px gap over a border-coloured ground, the same
    // way the feature grid does it, so the split matches the rest of the page
    // instead of floating as two rounded cards.
    <div className="grid gap-px bg-border pt-px lg:grid-cols-[1fr_320px]">
      {/* Canvas */}
      <div
        ref={canvasRef}
        style={canvasStyle}
        className={cn(
          // text-foreground matters: the uploader's labels have no colour class
          // of their own, so without it they inherit the page colour and go
          // black-on-black the moment a dark preset is selected.
          "flex min-h-[420px] flex-col bg-background p-6 text-foreground transition-colors sm:p-10",
          mode === "dark" && "dark",
        )}
      >
        <p className="mb-6 font-mono text-xs text-muted-foreground">
          &lt;FileUploader /&gt;
        </p>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-md">
            {/* The drop zone ships transparent, which is right on a plain page
                but lets the dot grid run through it here. Filled from the call
                site rather than in packages/registry: an opaque default would
                reach everyone who installs the block, including people who put
                it on a coloured surface on purpose. */}
            <FileUploader
              key={resetToken}
              baseUrl={PLAYGROUND_API}
              sign={signPlaygroundUpload}
              maxSize={10 * 1024 * 1024}
              className="[&_[role=button]]:bg-background"
            />
          </div>
        </div>
      </div>

      {/* Controls */}
      {/* A fraction of the way from the page toward muted, rather than muted
          itself, which lands too far from the canvas. Mixed rather than layered
          at low alpha because the grid's ground is the border colour: a
          translucent panel would pick that up and come out grey. */}
      <aside className="flex flex-col gap-5 bg-[color-mix(in_oklch,var(--muted)_35%,var(--background))] p-6 sm:p-8 lg:p-6">
        <div>
          <h3 className="text-sm font-medium">Theme editor</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            The component below is the one you install. Nothing you drop here is
            uploaded anywhere.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={presetId} className="text-xs font-medium">
            Preset
          </Label>
          <Select
            value={theme.id}
            onValueChange={(id) => {
              setTheme(themes.find((t) => t.id === id) ?? themes[0]);
              setOverrides({});
            }}
          >
            <SelectTrigger id={presetId} className="w-full">
              <SelectValue placeholder="Pick a preset" />
            </SelectTrigger>
            <SelectContent>
              {themes.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-md border border-border p-1">
          {(["light", "dark"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setModeOverride(value)}
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

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium">Primary</span>
          {/* No format select on purpose: resolveTokens picks the label colour
              from this value's luminance, which is read as hex. Letting the
              picker hand back rgb() or hsl() would silently fall back to a
              mid-grey guess and could put white text on a pale button. */}
          {/* Uncontrolled, re-keyed when the preset or mode changes. Driving it
              with `value` made it echo its own normalisation back on mount
              (#27272a in, #262629 out), which recorded an override and left the
              theme dirty before anyone touched it. */}
          <ColorPicker
            key={`${theme.id}-${mode}`}
            defaultValue={overrides.primary ?? tokens.primary}
            onValueChange={(next) =>
              setOverrides((o) => ({ ...o, primary: next }))
            }
            format="hex"
          >
            {/* asChild: the trigger renders a filled shadcn Button by default,
                which turns the row into a solid bar. This keeps it looking like
                the other controls in the panel. */}
            <ColorPickerTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex h-8 w-full items-center gap-2 rounded-md border border-border px-2 text-left transition-all",
                  focusRing,
                  pressable,
                )}
              >
                <ColorPickerSwatch className="size-5 shrink-0 rounded" />
                <span className="font-mono text-xs uppercase text-muted-foreground">
                  {overrides.primary ?? tokens.primary}
                </span>
              </button>
            </ColorPickerTrigger>
            <ColorPickerContent className="w-56">
              <ColorPickerArea />
              <div className="flex items-center gap-2">
                <ColorPickerEyeDropper />
                <ColorPickerHueSlider />
              </div>
              <ColorPickerInput />
            </ColorPickerContent>
          </ColorPicker>
        </div>

        {/* Not a <label>: a Radix slider is a composite widget, not a labelable
            control, so the name goes on aria-label instead. */}
        <div className="flex flex-col gap-3">
          <span className="flex items-center justify-between text-xs font-medium">
            Radius
            <span className="font-mono text-muted-foreground">
              {tokens.radius}
            </span>
          </span>
          <Slider
            aria-label="Corner radius"
            min={0}
            max={1.5}
            step={0.125}
            value={[parseFloat(tokens.radius) || 0]}
            onValueChange={([next]) =>
              setOverrides((o) => ({ ...o, radius: `${next}rem` }))
            }
            className="**:data-[slot=slider-thumb]:shadow-none [&>:last-child>span]:h-6 [&>:last-child>span]:w-2.5 [&>:last-child>span]:border-[3px] [&>:last-child>span]:border-background [&>:last-child>span]:bg-primary [&>:last-child>span]:ring-offset-0"
          />
        </div>

        <div className="mt-auto flex flex-col gap-2 border-t border-border pt-4">
          <PanelButton
            onClick={() => copy(toCss(theme, overrides), "css")}
            done={copied === "css"}
          >
            Copy CSS
          </PanelButton>
          <PanelButton
            onClick={() => copy(INSTALL, "install")}
            done={copied === "install"}
          >
            Copy install command
          </PanelButton>
          <button
            type="button"
            onClick={() => {
              setTheme(themes[0]);
              setOverrides({});
              setModeOverride(null);
              setResetToken((n) => n + 1);
            }}
            className={cn(
              "inline-flex h-8 items-center justify-center gap-2 rounded-md border border-transparent text-xs font-medium text-muted-foreground transition-all hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
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
        "inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border text-xs font-medium transition-all hover:bg-muted",
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
