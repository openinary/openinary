"use client";

import { cn } from "@/lib/utils";
import {
  TooltipProvider,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import Logo from "@/components/logo";

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

function flattenFeatures(features: FeatureCategory[]): {
  name: string;
  description?: string;
  openinary: boolean | string;
  competitor: boolean | string;
  category: string;
}[] {
  return features.flatMap((cat) =>
    cat.items.map((item) => ({
      ...item,
      category: cat.category,
      competitor: false, // placeholder, will be resolved in component
    })),
  );
}

export function ComparisonTable({
  features,
  competitorSlug,
  competitorName,
}: {
  features: FeatureCategory[];
  competitorSlug: string;
  competitorName: string;
}) {
  const allItems = features.flatMap((cat) =>
    cat.items.map((item) => ({
      name: item.name,
      description: undefined as string | undefined,
      openinary: item.openinary,
      competitor:
        item.competitors[competitorSlug as keyof typeof item.competitors] ??
        false,
      category: cat.category,
    })),
  );

  // Group by category for section headers
  const categories = features.map((cat) => ({
    category: cat.category,
    count: cat.items.length,
  }));

  const renderPlanColumn = (plan: "openinary" | "competitor") => {
    const header =
      plan === "openinary" ? (
        <div className="sticky top-0 flex h-12 sm:h-14 flex-col items-center justify-center gap-1.5 rounded-t-xl px-2 sm:px-4 text-center lg:px-6">
          <div className="scale-75 sm:scale-90">
            <Logo />
          </div>
        </div>
      ) : (
        <div className="sticky top-0 flex h-12 sm:h-14 flex-col items-center justify-center gap-1.5 px-2 sm:px-4 pt-2 text-center lg:px-8">
          <span className="text-xs sm:text-sm font-semibold truncate max-w-full">
            {competitorName}
          </span>
        </div>
      );

    let itemIndex = 0;

    return (
      <div
        data-plan={plan}
        className={cn(
          plan === "openinary" &&
            "ring-border bg-card/50 shadow-black/6.5 relative z-10 rounded-xl shadow-xl ring-1",
        )}
      >
        {header}

        <div>
          {categories.map((cat) => (
            <div key={cat.category}>
              {/* Category separator row */}
              <div className="flex h-8 sm:h-10 items-center justify-center px-2 sm:px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider bg-muted/30">
                &nbsp;
              </div>
              {Array.from({ length: cat.count }).map((_, i) => {
                const item = allItems[itemIndex++];
                const value =
                  plan === "openinary" ? item.openinary : item.competitor;
                return (
                  <div
                    key={`${cat.category}-${i}`}
                    className="odd:bg-card flex h-12 sm:h-14 items-center justify-center px-2 sm:px-6 text-sm last:h-[calc(3rem+1px)] sm:last:h-[calc(3.5rem+1px)] last:border-b group-last:odd:rounded-r-lg"
                  >
                    <div>
                      {value === true ? (
                        <Indicator checked />
                      ) : value === false ? (
                        <Indicator />
                      ) : (
                        <span className="text-[10px] sm:text-xs text-muted-foreground text-center leading-tight">
                          {value}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          <div className="h-4 sm:h-6"></div>
        </div>
      </div>
    );
  };

  let featureIndex = 0;

  return (
    <div className="-mx-4 sm:mx-0">
      <div className="overflow-x-auto pt-4 -mt-4 pb-8">
        <div className="grid grid-cols-[1fr_auto] min-w-[480px]">
          {/* Feature names column */}
          <div>
            <div className="z-1 sticky top-0 flex h-12 sm:h-14 items-end gap-1.5 px-3 sm:px-6 py-2">
              <div className="text-muted-foreground text-xs sm:text-sm font-medium">
                Features
              </div>
            </div>

            {categories.map((cat) => {
              const catFeatures = allItems.slice(
                featureIndex,
                featureIndex + cat.count,
              );
              featureIndex += cat.count;
              return (
                <div key={cat.category}>
                  {/* Category header */}
                  <div className="flex h-8 sm:h-10 items-center px-3 sm:px-6 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-foreground bg-muted/30">
                    {cat.category}
                  </div>
                  {catFeatures.map((feature, index) => (
                    <div
                      key={`${cat.category}-${index}`}
                      className="text-muted-foreground md:first:rounded-tl-xl even:bg-card flex h-12 sm:h-14 items-center rounded-l-lg px-3 sm:px-6 last:h-[calc(3rem+1px)] sm:last:h-[calc(3.5rem+1px)] md:last:rounded-bl-xl"
                    >
                      <div className="text-xs sm:text-sm">{feature.name}</div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {/* Plan columns */}
          <div className="grid grid-cols-2">
            {(["openinary", "competitor"] as const).map((plan) => (
              <div key={plan} className="group">
                {renderPlanColumn(plan)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const Indicator = ({ checked = false }: { checked?: boolean }) => {
  return (
    <span
      className={cn(
        "flex size-4 items-center justify-center rounded-full bg-rose-500 font-sans text-xs font-semibold text-white",
        checked && "bg-emerald-600 text-white",
      )}
    >
      {checked ? <CheckIcon /> : "✗"}
    </span>
  );
};

const CheckIcon = () => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 512 512"
      className="size-2.5"
    >
      <path
        fill="currentColor"
        d="M17.47 250.9C88.82 328.1 158 397.6 224.5 485.5c72.3-143.8 146.3-288.1 268.4-444.37L460 26.06C356.9 135.4 276.8 238.9 207.2 361.9c-48.4-43.6-126.62-105.3-174.38-137z"
      />
    </svg>
  );
};
