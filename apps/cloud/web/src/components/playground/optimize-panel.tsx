/**
 * biome-ignore-all lint/performance/noImgElement: next/image is wrong for every
 * image on this page. Half of them are blob: object URLs from a canvas, which
 * it cannot take at all; the rest are static files whose exact byte counts are
 * printed next to them, and re-encoding those through the optimizer would make
 * the displayed size a lie.
 */
"use client";

import { CopyInput, formatFileSize } from "@openinary/ui";
import { useQuery } from "@tanstack/react-query";
import { ImagePlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  type DemoImage,
  demoImages,
  savingPercent,
} from "@/components/playground/demo-assets";
import { PATTERN_BASE, UrlPattern } from "@/components/playground/url-pattern";
import { useOwnImage } from "@/components/playground/use-own-image";
import { Button } from "@/components/ui/button";
import { CircularProgress } from "@/components/ui/circular-progress";
import { Spinner } from "@/components/ui/spinner";
import {
  trackPlaygroundTransformApplied,
  trackPlaygroundUrlCopied,
} from "@/lib/analytics";
import type { RenderedImage } from "@/lib/playground/render";
import { cn } from "@/lib/utils";
import { orpc } from "@/utils/orpc";

const OWN_WIDTH_STEPS = [1500, 900];

type Selection = { kind: "demo"; image: DemoImage } | { kind: "own" };

/** Empty when there is no source yet - the demo manifest ships empty until the
 *  demo media lands (see scripts/demo-sources/README.md), and a user may not
 *  have picked a file, in which case there is no width to offer at all. */
function widthsFor(selection: Selection, image: DemoImage | null, own: number) {
  if (selection.kind === "demo" && image)
    return image.variants.map((variant) => variant.width);
  if (own <= 0) return [];
  return [own, ...OWN_WIDTH_STEPS.filter((step) => step < own)];
}

/**
 * The before/after comparison. Nothing here is fetched from the CDN: demo
 * media is precomputed and served from /demo, a user's own file is re-encoded
 * on a canvas in their browser. The URL below the comparison is text to copy,
 * never the preview's src - pointing the preview at the CDN would wake the
 * transform container on every click.
 */
export function OptimizePanel() {
  const [selection, setSelection] = useState<Selection>(
    demoImages.length > 0
      ? { kind: "demo", image: demoImages[0] }
      : { kind: "own" },
  );
  const [width, setWidth] = useState<number | null>(null);
  const [rendered, setRendered] = useState<RenderedImage | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const own = useOwnImage();
  const { data: buckets } = useQuery(orpc.bucket.list.queryOptions());
  const bucket = buckets?.find((b) => b.active) ?? buckets?.[0];
  const cdnBaseUrl = bucket
    ? `${process.env.NEXT_PUBLIC_SERVER_URL}/b/${bucket.id}`
    : "";

  const demoImage = selection.kind === "demo" ? selection.image : null;
  const ownWidth = own.image?.bitmap.width ?? 0;
  const widths = widthsFor(selection, demoImage, ownWidth);
  const activeWidth: number | undefined =
    width && widths.includes(width) ? width : widths[0];

  // Own files are re-encoded lazily, one width at a time, and cached by the
  // hook - clicking through the steps re-renders only what hasn't been done.
  useEffect(() => {
    if (selection.kind !== "own" || !own.image || !activeWidth) {
      setRendered(null);
      return;
    }
    let cancelled = false;
    own.render(activeWidth).then((result) => {
      if (!cancelled) setRendered(result);
    });
    return () => {
      cancelled = true;
    };
  }, [selection.kind, own.image, own.render, activeWidth]);

  const variant = demoImage?.variants.find((v) => v.width === activeWidth);
  const originalBytes = demoImage?.original.bytes ?? own.image?.file.size ?? 0;
  const optimizedBytes = variant?.avif.bytes ?? rendered?.bytes ?? 0;
  const saving = savingPercent(originalBytes, optimizedBytes);

  const assetKind = selection.kind === "demo" ? "demo" : "own";
  // Only an uploaded file has a URL that resolves. A demo image lives in /demo
  // and never reached the bucket, so it gets the shape instead - see UrlPattern.
  const path = selection.kind === "own" ? own.image?.path : null;
  const url =
    activeWidth && path
      ? `${cdnBaseUrl}/t/w_${activeWidth},f_auto/${path}`
      : null;
  const pattern =
    activeWidth && !path
      ? `${PATTERN_BASE}/t/w_${activeWidth},f_auto/{path}`
      : null;

  const pickWidth = (next: number) => {
    setWidth(next);
    trackPlaygroundTransformApplied({
      surface: "images",
      op: "w",
      value: String(next),
      asset: assetKind,
    });
  };

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    setSelection({ kind: "own" });
    setWidth(null);
    own.select(file);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-4">
        <div className="grid @2xl/main:grid-cols-[1fr_auto_1fr] gap-3">
          <Frame label="Original">
            {demoImage ? (
              <>
                <img
                  src={demoImage.original.src}
                  alt={demoImage.label}
                  className="h-full w-full object-cover"
                />
                <Badges
                  items={[
                    formatFileSize(demoImage.original.bytes),
                    `${demoImage.original.width}x${demoImage.original.height}`,
                    demoImage.original.format,
                  ]}
                />
              </>
            ) : own.image ? (
              <>
                <img
                  src={own.image.previewUrl}
                  alt={own.image.file.name}
                  className="h-full w-full object-cover"
                />
                <Badges
                  items={[
                    formatFileSize(own.image.file.size),
                    `${own.image.bitmap.width}x${own.image.bitmap.height}`,
                    (own.image.file.type.split("/")[1] ?? "").toUpperCase(),
                  ]}
                />
              </>
            ) : (
              <EmptyFrame />
            )}
          </Frame>

          <div className="flex flex-row @2xl/main:flex-col items-center justify-center gap-3">
            <div className="relative flex size-[72px] shrink-0 items-center justify-center">
              <CircularProgress value={saving} size={72} thickness={5} />
              <span className="absolute text-center font-medium text-[11px] leading-tight">
                {optimizedBytes > 0 ? (
                  <>
                    {saving}%
                    <br />
                    smaller
                  </>
                ) : (
                  "-"
                )}
              </span>
            </div>
            <div className="flex flex-row @2xl/main:flex-col gap-1">
              {widths.map((step) => (
                <Button
                  key={step}
                  size="sm"
                  variant={step === activeWidth ? "secondary" : "ghost"}
                  className="h-7 text-xs tabular-nums"
                  onClick={() => pickWidth(step)}
                >
                  {step}px
                </Button>
              ))}
            </div>
          </div>

          <Frame label="Optimized" align="right">
            {variant ? (
              <>
                <picture>
                  {/* AVIF first, WebP behind it: Safari only decodes AVIF from
                      16.4, and the fallback costs one extra static file. */}
                  <source srcSet={variant.avif.src} type="image/avif" />
                  <img
                    src={variant.webp.src}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </picture>
                <Badges
                  align="right"
                  items={[
                    formatFileSize(variant.avif.bytes),
                    `${variant.width}x${variant.height}`,
                    "AVIF",
                  ]}
                />
              </>
            ) : rendered ? (
              <>
                <img
                  src={rendered.url}
                  alt=""
                  className="h-full w-full object-cover"
                />
                <Badges
                  align="right"
                  items={[
                    formatFileSize(rendered.bytes),
                    `${rendered.width}x${rendered.height}`,
                    "WEBP",
                  ]}
                />
              </>
            ) : own.image ? (
              <div className="flex h-full items-center justify-center">
                <Spinner />
              </div>
            ) : (
              <EmptyFrame />
            )}
          </Frame>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
          {demoImages.map((image) => (
            <button
              key={image.role}
              type="button"
              title={image.hint}
              onClick={() => {
                setSelection({ kind: "demo", image });
                setWidth(null);
              }}
              className={cn(
                "size-14 overflow-hidden rounded-md border transition-all",
                demoImage?.role === image.role
                  ? "ring-2 ring-ring ring-offset-2 ring-offset-background"
                  : "opacity-70 hover:opacity-100",
              )}
            >
              <img
                src={image.variants.at(-1)?.webp.src ?? image.original.src}
                alt={image.label}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-14 flex-1 text-xs",
              selection.kind === "own" && "border-ring",
            )}
            onClick={() => fileInput.current?.click()}
          >
            {own.isUploading ? (
              <Spinner className="size-4" />
            ) : (
              <ImagePlus className="size-4" />
            )}
            Upload an image to your bucket
          </Button>
        </div>

        {selection.kind === "own" && own.image && (
          <p className="mt-2 text-muted-foreground text-xs leading-relaxed">
            Encoded to WebP in your browser - no browser can encode AVIF from a
            canvas. In production Openinary serves AVIF, which is smaller still.
          </p>
        )}
      </div>

      {/* No source, no URL: with the demo manifest still empty and nothing
          picked, there is no width to put in one. */}
      {(url || pattern) && (
        <div
          className="space-y-2"
          onCopyCapture={() =>
            trackPlaygroundUrlCopied({
              surface: "images",
              op: "w",
              asset: assetKind,
            })
          }
        >
          {url && <CopyInput label="Delivery URL" value={url} />}
          {pattern && <UrlPattern label="Delivery URL" pattern={pattern} />}
          <p className="text-muted-foreground text-xs leading-relaxed">
            {url ? (
              "That's a live URL for the file you just uploaded - open it and Openinary renders it on the fly."
            ) : (
              <>
                The shape of the URL, not one to open - there's no file of yours
                behind it yet. Upload one above and this becomes a real URL you
                can copy. <span className="font-mono">f_auto</span> picks the
                best format each browser accepts.
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

function Frame({
  label,
  align = "left",
  children,
}: {
  label: string;
  align?: "left" | "right";
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p
        className={cn(
          "text-muted-foreground text-xs",
          align === "right" && "text-right",
        )}
      >
        {label}
      </p>
      <div className="relative aspect-[4/3] overflow-hidden rounded-md border bg-muted">
        {children}
      </div>
    </div>
  );
}

function Badges({
  items,
  align = "left",
}: {
  items: string[];
  align?: "left" | "right";
}) {
  return (
    <div
      className={cn(
        "absolute top-2 flex flex-col gap-1",
        align === "right" ? "right-2 items-end" : "left-2 items-start",
      )}
    >
      {items.filter(Boolean).map((item) => (
        <span
          key={item}
          className="rounded bg-background/85 px-1.5 py-0.5 font-mono text-[10px] shadow-sm backdrop-blur-sm"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function EmptyFrame() {
  return (
    <div className="flex h-full items-center justify-center px-4 text-center text-muted-foreground text-xs">
      Pick a file below to compare
    </div>
  );
}
