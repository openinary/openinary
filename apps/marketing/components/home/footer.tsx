import Link from "next/link";

import { gutter } from "@/components/home/section";
import { LogoMarkMono } from "@/components/logo-mark";

const legalLinks = [
  { href: "/legal", label: "Legal Notice" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy Policy" },
];

export function Footer() {
  return (
    <footer className={`${gutter} border-t border-border`}>
      <div className="flex flex-col gap-4 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-3">
          <LogoMarkMono className="opacity-60" />© {new Date().getFullYear()} Openinary
        </p>
        <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {legalLinks.map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                className="transition-colors hover:text-foreground"
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
