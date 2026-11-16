import { Check, Minus } from "lucide-react";

import { Mark } from "@/components/site/mark";
import { cn } from "@/lib/utils";

type FeatureItem = {
  name: string;
  openinary: boolean | string;
  competitors: Record<string, boolean | string>;
};

export type FeatureCategory = { category: string; items: FeatureItem[] };

const cols = "grid grid-cols-[1.2fr_1fr_1fr]";

/** The two names, each with its badge: our mark, or the other's initial. */
export function Who({ name, us, className }: { name: string; us?: boolean; className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 text-ink-12", className)}>
      {us ? (
        <Mark className="size-3.5 text-brand" />
      ) : (
        <span className="grid size-4 place-items-center rounded-[4px] bg-ink-3 text-[10px] font-medium text-ink-11">
          {name[0]}
        </span>
      )}
      {name}
    </span>
  );
}

/**
 * Feature by feature: each category is its own row, its name on the left and
 * its lines on the right, so the eye reads down one subject at a time.
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
  return (
    <div role="table" aria-label={`Openinary and ${competitorName}`} className="text-[13px] leading-5">
      <div role="row" className="hidden md:grid md:grid-cols-[220px_1fr]">
        <span role="columnheader" />
        <div className={cn(cols, "px-4 pb-3 text-ink-10")}>
          <span role="columnheader">Feature</span>
          <span role="columnheader"><Who name="Openinary" us /></span>
          <span role="columnheader"><Who name={competitorName} /></span>
        </div>
      </div>
      {features.map((cat) => (
        <div key={cat.category} role="rowgroup" className="grid gap-3 border-t-[0.5px] border-rule py-6 md:grid-cols-[220px_1fr] md:gap-0">
          <h3 className="text-[15px] font-medium tracking-[-0.01em] text-ink-12">{cat.category}</h3>
          <div className="overflow-x-auto rounded-lg shadow-[inset_0_0_0_0.5px_var(--ink-6)]">
            <div className="min-w-[480px]">
              <div role="row" className={cn(cols, "border-b-[0.5px] border-rule px-4 py-2 text-[12px] text-ink-10 md:hidden")}>
                <span role="columnheader">Feature</span>
                <span role="columnheader">Openinary</span>
                <span role="columnheader">{competitorName}</span>
              </div>
              {cat.items.map((item, i) => (
                <div key={item.name} role="row" className={cn(cols, "gap-3 px-4 py-3", i > 0 && "border-t-[0.5px] border-rule")}>
                  <span role="rowheader" className="text-ink-11">{item.name}</span>
                  <span role="cell" className="text-ink-12"><Value value={item.openinary} /></span>
                  <span role="cell" className="text-ink-11"><Value value={item.competitors[competitorSlug] ?? false} /></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Value({ value }: { value: boolean | string }) {
  if (value === true)
    return (
      <span className="flex items-center gap-2">
        <Check aria-hidden className="size-3.5 shrink-0" /> Yes
      </span>
    );
  if (value === false)
    return (
      <span className="flex items-center gap-2 text-ink-9">
        <Minus aria-hidden className="size-3.5 shrink-0" /> No
      </span>
    );
  return <span>{value}</span>;
}
