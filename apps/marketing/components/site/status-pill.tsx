"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

type Overall = { impact: "operational" | "maintenance" | "degraded" | "partial" | "major"; label: string };

const DOT: Record<Overall["impact"], string> = {
  operational: "bg-ok",
  maintenance: "bg-info",
  degraded: "bg-warn",
  partial: "bg-warn",
  major: "bg-bad",
};

/**
 * Fetched from the browser so every page can stay static; the footer shows
 * a neutral link until it answers rather than claim a state it hasn't checked.
 */
export function StatusPill() {
  const [status, setStatus] = useState<Overall | null>(null);
  useEffect(() => {
    fetch("/api/status")
      .then((r) => (r.ok ? r.json() : null))
      .then(setStatus)
      .catch(() => {});
  }, []);

  return (
    <Link
      href="/status"
      className="inline-flex h-5 w-fit items-center gap-2 text-[13px] text-ink-10 transition-colors hover:text-ink-12"
    >
      <span
        className={cn("size-2 rounded-full", status ? DOT[status.impact] : "bg-ink-6")}
        aria-hidden
      />
      {status?.label ?? "System status"}
    </Link>
  );
}
