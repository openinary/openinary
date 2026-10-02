"use client";

import { Check, Copy } from "lucide-react";
import { type ReactNode, useState } from "react";
import { cn } from "../lib/utils";
import { Button } from "../ui/button";

/**
 * A delivery URL split into what the reader needs to tell apart: the base
 * (muted), the transformation (green) and the asset's path (blue).
 */
export function DeliveryUrl({
  url,
  path,
  params,
  className,
}: {
  /** The full URL, ending in `/t/{params/}{path}`. */
  url: string;
  /** The encoded path the URL ends with. */
  path: string;
  params?: string;
  className?: string;
}) {
  const tail = params ? `${params}/${path}` : path;
  const base = url.slice(0, url.length - tail.length);
  return (
    <p className={cn("break-all font-mono text-xs leading-relaxed", className)}>
      <span className="text-muted-foreground">{base}</span>
      {params && (
        <span className="text-emerald-600 dark:text-emerald-400">{params}/</span>
      )}
      <span className="text-sky-600 dark:text-sky-400">{path}</span>
    </p>
  );
}

/** The card every tab of the details panel lays its sections out in. */
export function DetailsCard({
  title,
  description,
  className,
  children,
}: {
  title: string;
  description?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "space-y-3 rounded-xl border bg-background p-3 shadow-xs",
        className,
      )}
    >
      <div className="space-y-0.5">
        <h3 className="text-sm font-medium">{title}</h3>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

/** Copies `value`, and says so with a check for a moment. */
export function CopyButton({
  value,
  label = "Copy URL",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      disabled={!value}
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="stroke-emerald-500" /> : <Copy />}
      {copied ? "Copied" : label}
    </Button>
  );
}
