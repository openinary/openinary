"use client";

import { RotateCcw } from "lucide-react";
import { type CSSProperties, type ReactNode, useState } from "react";
import { cn, encodePath, toAbsoluteUrl } from "../lib/utils";
import { useOpeninary } from "../provider/openinary-provider";
import type { MediaFile, MediaType } from "../types";
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
import { CopyButton, DeliveryUrl, DetailsCard } from "./delivery-url";

type Params = Partial<Record<"w" | "h" | "c" | "g" | "r" | "q" | "f", string>>;

// Mirrors the registries in packages/core/src/utils/{image,video}/param-registry.ts.
const OPTIONS: Record<MediaType, { c: string[]; g: string[]; f: string[] }> = {
  image: {
    c: ["fill", "fit", "scale", "crop", "pad"],
    g: ["center", "north", "south", "east", "west", "face", "auto"],
    f: ["auto", "avif", "webp", "jpeg", "png"],
  },
  video: {
    c: ["fill", "fit", "scale", "crop", "pad"],
    g: ["center", "north", "south", "east", "west", "auto"],
    f: ["mp4", "webm", "mov"],
  },
};

const PRESETS: Record<MediaType, { label: string; params: Params }[]> = {
  image: [
    { label: "Thumbnail", params: { w: "300", h: "300", c: "fill" } },
    { label: "Banner 16:9", params: { w: "1600", h: "900", c: "fill" } },
    { label: "Avatar", params: { w: "200", h: "200", c: "fill", g: "face", r: "max" } },
    { label: "WebP", params: { f: "webp" } },
    { label: "Light", params: { q: "60" } },
  ],
  video: [
    { label: "720p", params: { w: "1280", h: "720", c: "fit" } },
    { label: "Square", params: { w: "720", h: "720", c: "fill" } },
    { label: "WebM", params: { f: "webm" } },
    { label: "Light", params: { q: "50" } },
  ],
};

// Fixed order, so the same settings always give the same URL (and cache key).
function serialize(params: Params) {
  const sized = Boolean(params.w || params.h);
  return (["w", "h", "c", "g", "r", "q", "f"] as const)
    .filter((key) => params[key] && params[key] !== "auto")
    .filter((key) => sized || (key !== "c" && key !== "g"))
    .map((key) => `${key}_${params[key]}`)
    .join(",");
}

const same = (a: Params, b: Params) => serialize(a) === serialize(b);

export function AssetTransformationsTab({
  asset,
  transformBaseUrl,
}: {
  asset: MediaFile;
  transformBaseUrl: string;
}) {
  const { apiBaseUrl } = useOpeninary();
  const [params, setParams] = useState<Params>(PRESETS[asset.type][0].params);
  const set = (key: keyof Params) => (value: string) =>
    setParams((current) => ({ ...current, [key]: value }));

  const options = OPTIONS[asset.type];
  const segment = serialize(params);
  const path = encodePath(asset.path);
  const url = toAbsoluteUrl(
    `${transformBaseUrl}/t/${segment ? `${segment}/` : ""}${path}`,
  );

  // The preview is drawn by the browser from the original, not requested as
  // a real transformation: changing a setting costs nothing, and it shows
  // up at once. Size, crop, gravity and corners are imitated with CSS;
  // quality and format only exist on delivery.
  const original = `${apiBaseUrl}/download/${path}`;

  return (
    <div className="space-y-3">
      <DetailsCard title="Presets">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS[asset.type].map((preset) => {
            const active = same(params, preset.params);
            return (
              <button
                key={preset.label}
                type="button"
                aria-pressed={active}
                onClick={() => setParams(preset.params)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </DetailsCard>

      <DetailsCard
        title="Build a transformation"
        description="Uses Cloudinary's parameter names, so w_300,c_fill works as is."
      >
        <div className="grid grid-cols-2 gap-x-2 gap-y-2.5">
          <Field label="Width">
            <Input
              type="number"
              min={1}
              placeholder="Auto"
              className="h-8"
              value={params.w ?? ""}
              onChange={(event) => set("w")(event.target.value)}
            />
          </Field>
          <Field label="Height">
            <Input
              type="number"
              min={1}
              placeholder="Auto"
              className="h-8"
              value={params.h ?? ""}
              onChange={(event) => set("h")(event.target.value)}
            />
          </Field>
          <Field label="Crop">
            <Choice value={params.c} options={options.c} onChange={set("c")} placeholder="fill" />
          </Field>
          <Field label="Gravity">
            <Choice value={params.g} options={options.g} onChange={set("g")} placeholder="center" />
          </Field>
          <Field label="Format">
            <Choice
              value={params.f}
              options={options.f}
              onChange={set("f")}
              placeholder={options.f[0]}
            />
          </Field>
          <Field label="Quality">
            <Input
              type="number"
              min={1}
              max={100}
              placeholder={asset.type === "image" ? "80" : "Auto"}
              className="h-8"
              value={params.q ?? ""}
              onChange={(event) => set("q")(event.target.value)}
            />
          </Field>
        </div>

        <PreviewFrame asset={asset} src={original} params={params} />

        <DeliveryUrl url={url} path={path} params={segment || undefined} />

        <div className="grid grid-cols-2 gap-2">
          <CopyButton value={url} />
          <Button variant="outline" size="sm" onClick={() => setParams({})}>
            <RotateCcw />
            Reset
          </Button>
        </div>
      </DetailsCard>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-normal text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Choice({
  value,
  options,
  onChange,
  placeholder,
}: {
  value?: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <Select
      value={value ?? null}
      onValueChange={(next) => onChange((next as string | null) ?? "")}
    >
      <SelectTrigger size="sm" className="w-full">
        <SelectValue>
          {(current: string | null) =>
            current ?? <span className="text-muted-foreground">{placeholder}</span>
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// How each crop mode and gravity reads as CSS object-fit / object-position.
const FIT: Record<string, CSSProperties["objectFit"]> = {
  fill: "cover",
  crop: "cover",
  fit: "contain",
  pad: "contain",
  scale: "fill",
};
const POSITION: Record<string, string> = {
  north: "top",
  south: "bottom",
  east: "right",
  west: "left",
};
const FRAME_HEIGHT = 176; // h-44

function PreviewFrame({
  asset,
  src,
  params,
}: {
  asset: MediaFile;
  src: string;
  params: Params;
}) {
  const width = Number(params.w) || 0;
  const height = Number(params.h) || 0;
  // With both sides set the output takes their shape; with one or none it
  // keeps the original's, which the media shows by itself.
  const ratio = width && height ? width / height : null;
  const radius =
    params.r === "max"
      ? "50%"
      : params.r && width
        ? `${(Number(params.r) / width) * 100}%`
        : undefined;
  const style: CSSProperties = {
    objectFit: ratio ? (FIT[params.c ?? "fill"] ?? "cover") : "contain",
    objectPosition: POSITION[params.g ?? ""] ?? "center",
  };
  const media =
    asset.type === "image" ? (
      // biome-ignore lint/performance/noImgElement: a plain preview of the original
      <img src={src} alt={`${asset.name}, transformed`} className="size-full" style={style} />
    ) : (
      // #t=5 shows the frame the dashboard's thumbnails use.
      <video src={`${src}#t=5`} preload="metadata" muted playsInline className="size-full" style={style} />
    );

  return (
    <div className="space-y-1.5">
      <div className="flex h-44 items-center justify-center overflow-hidden rounded-lg border bg-muted">
        {ratio ? (
          <div
            className={cn("overflow-hidden", params.c === "pad" && "bg-background")}
            style={{
              aspectRatio: ratio,
              width: `min(100%, ${FRAME_HEIGHT * ratio}px)`,
              borderRadius: radius,
            }}
          >
            {media}
          </div>
        ) : (
          media
        )}
      </div>
      <p className="text-center text-xs text-muted-foreground">
        {width || height
          ? `${width || "auto"} × ${height || "auto"}, previewed in your browser`
          : "Original size, previewed in your browser"}
      </p>
    </div>
  );
}
