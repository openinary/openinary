import { Check, Minus } from "lucide-react";

import { panelSurface } from "@/components/home/cta-button";
import { cn } from "@/lib/utils";

type FeatureItem = {
  name: string;
  description?: string;
  openinary: boolean | string;
  competitors: Record<string, boolean | string>;
};

type FeatureCategory = {
  category: string;
  items: FeatureItem[];
};

/**
 * Full-bleed rows in the page's box structure, like the calculator's
 * comparison block: hairline rules edge to edge, the Openinary column set off
 * on the shared panel surface rather than floated as a card. No client code,
 * it is all static rows.
 */
export function ComparisonTable({
  features,
  competitorSlug,
  competitorName,
}: {
  features: FeatureCategory[];
  competitorSlug: string;
  competitorName: string;
}) {
  const row = "grid grid-cols-[1fr_9rem_9rem]";
  const value = "flex items-center justify-center border-l border-border px-3 py-3";

  return (
    // The frame is the caller's: the well above draws the top rule and the
    // side rules, the next section's border closes the bottom. In here rows
    // only ever add a border-t below the head and cells a border-l, so no
    // rule is ever drawn twice. On a phone the table scrolls inside its own
    // container rather than squeezing.
    <div className="overflow-x-auto">
      <div className="min-w-[560px]">
        {/* Column heads */}
        <div className={row}>
          <div className="px-4 py-3 md:px-6" />
          <div className={cn(value, panelSurface, "text-sm font-medium text-foreground")}>
            Openinary
          </div>
          <div className={cn(value, "text-sm font-medium text-foreground")}>
            {competitorName}
          </div>
        </div>

        {features.map((cat) => (
          <div key={cat.category}>
            <div className={cn(row, "border-t border-border")}>
              <div className="px-4 py-3 text-[11px] uppercase leading-[1.5] tracking-[0.14em] text-muted-foreground/80 md:px-6">
                {cat.category}
              </div>
              <div className={cn("border-l border-border", panelSurface)} />
              <div className="border-l border-border" />
            </div>

            {cat.items.map((item) => (
              <div key={item.name} className={cn(row, "border-t border-border")}>
                <div className="flex items-center px-4 py-3 text-sm leading-[1.5] text-muted-foreground md:px-6">
                  {item.name}
                </div>
                <div className={cn(value, panelSurface)}>
                  <Value value={item.openinary} />
                </div>
                <div className={value}>
                  <Value
                    value={
                      item.competitors[
                        competitorSlug as keyof typeof item.competitors
                      ] ?? false
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Value({ value }: { value: boolean | string }) {
  if (value === true) {
    return (
      <>
        <Check className="size-4 text-foreground" aria-hidden />
        <span className="sr-only">Yes</span>
      </>
    );
  }
  if (value === false) {
    return (
      <>
        <Minus className="size-4 text-muted-foreground/40" aria-hidden />
        <span className="sr-only">No</span>
      </>
    );
  }
  return (
    <span className="text-center text-xs leading-tight text-muted-foreground">
      {value}
    </span>
  );
}
