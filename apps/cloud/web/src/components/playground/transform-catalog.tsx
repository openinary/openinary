/**
 * biome-ignore-all lint/performance/noImgElement: these are pre-encoded static
 * pairs, already sized for the card. Running them back through next/image would
 * re-encode work the build script already did, and the AVIF <source> here is
 * exactly the negotiation next/image would take over.
 */
"use client";

import { demoTransforms } from "@/components/playground/demo-assets";
import { trackPlaygroundUrlCopied } from "@/lib/analytics";

/**
 * Static before/after pairs, one per operation, precomputed by
 * scripts/build-demo-assets.mjs. Nothing is computed at view time and nothing
 * is fetched from the CDN - which is also what lets this cover the two
 * operations a browser can't do (AVIF encoding and the smart crop's saliency
 * pass).
 */
export function TransformCatalog() {
  if (demoTransforms.length === 0) return null;

  return (
    <div className="space-y-3">
      <div>
        <p className="font-medium text-sm">Everything else you can ask for</p>
        <p className="mt-1 text-muted-foreground text-xs">
          Each one is a segment between <span className="font-mono">/t/</span>{" "}
          and the file path. Combine them comma-separated, in any order.
        </p>
      </div>
      <div className="grid @4xl/main:grid-cols-3 @xl/main:grid-cols-2 gap-3">
        {demoTransforms.map((transform) => (
          <figure
            key={transform.id}
            className="overflow-hidden rounded-lg border"
          >
            <div className="grid grid-cols-2 gap-px bg-border">
              <img
                src={transform.before.webp.src}
                alt=""
                loading="lazy"
                className="aspect-square w-full bg-muted object-cover"
              />
              <picture>
                <source srcSet={transform.after.avif.src} type="image/avif" />
                <img
                  src={transform.after.webp.src}
                  alt={transform.label}
                  loading="lazy"
                  className="aspect-square w-full bg-muted object-contain"
                />
              </picture>
            </div>
            <figcaption className="space-y-1.5 p-3">
              <p className="font-medium text-sm">{transform.label}</p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                {transform.description}
              </p>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(transform.segment);
                  trackPlaygroundUrlCopied({
                    surface: "images",
                    op: transform.id,
                    asset: "demo",
                  });
                }}
                title="Copy this segment"
                className="w-full truncate rounded-md bg-muted px-2 py-1 text-left font-mono text-[11px] transition-colors hover:bg-muted/70"
              >
                {transform.segment}
              </button>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
