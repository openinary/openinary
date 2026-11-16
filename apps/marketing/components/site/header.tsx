"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Menu, X } from "lucide-react";

import { Mark } from "@/components/site/mark";
import {
  productMenu,
  resourcesMenu,
  solutionsMenu,
  type NavItem,
} from "@/components/site/nav";
import {
  APP_URL,
  GITHUB_URL,
  buttonClass,
  focusRing,
} from "@/components/site/ui";
import { lenis } from "@/components/site/smooth-scroll";
import { useGitHubStars } from "@/hooks/use-github-stars";
import { cn } from "@/lib/utils";

const menus = [
  { label: "Product", items: productMenu },
  { label: "Solutions", items: solutionsMenu },
  { label: "Resources", items: resourcesMenu },
];

const linkClass = cn(
  "press inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-[13px] font-medium text-ink-11 hover:bg-chip hover:text-ink-12",
  focusRing,
);

export function SiteHeader() {
  const [open, setOpen] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const starCount = useGitHubStars();

  // A new page closes whatever was open on the last one (reset during render,
  // React's pattern for state that follows a prop).
  const [shownFor, setShownFor] = useState(pathname);
  if (shownFor !== pathname) {
    setShownFor(pathname);
    setOpen(null);
    setMobile(false);
  }

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // The open mobile menu is the only scroller: lock the page behind it.
  useEffect(() => {
    if (!mobile) return;
    const root = document.documentElement;
    // Inline "hidden", not Lenis's "clip": scrollbar-gutter (styles/index.css) only
    // holds the scrollbar's room under hidden, so the page doesn't jump sideways.
    root.style.overflow = "hidden";
    // Lenis drives the page from the wheel; stopped, it leaves the menu its own scroll.
    lenis?.stop();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobile(false);
    const wide = window.matchMedia("(min-width: 768px)");
    const onWide = () => wide.matches && setMobile(false);
    document.addEventListener("keydown", onKey);
    wide.addEventListener("change", onWide);
    return () => {
      root.style.overflow = "";
      lenis?.start();
      document.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onWide);
    };
  }, [mobile]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    const onDown = (e: PointerEvent) => {
      if (!navRef.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b-[0.5px] bg-page transition-colors",
        scrolled || mobile ? "border-ink-4" : "border-transparent",
      )}
    >
      <nav
        ref={navRef}
        aria-label="Main"
        className="mx-auto flex h-[46px] max-w-[1248px] items-center justify-between gap-4 px-5 md:px-6"
        onMouseLeave={() => setOpen(null)}
      >
        <div className="flex items-center gap-6">
          <Link
            href="/"
            aria-label="Openinary home"
            data-track-event="logo_clicked"
            data-track-prop-location="header"
            className={cn("flex items-center gap-2 rounded-md text-[15px] font-medium tracking-[-0.02em]", focusRing)}
          >
            <Mark className="size-[17px] text-brand" />
            Openinary
          </Link>

          <ul className="hidden items-center md:flex">
            {menus.map((menu) => (
              <li key={menu.label} className="relative" onMouseEnter={() => setOpen(menu.label)}>
                <button
                  type="button"
                  aria-expanded={open === menu.label}
                  aria-haspopup="true"
                  onClick={() => setOpen(open === menu.label ? null : menu.label)}
                  className={cn(linkClass, open === menu.label && "text-ink-12")}
                >
                  {menu.label}
                  <ChevronDown
                    aria-hidden
                    className={cn("size-3 text-ink-10 transition-transform duration-150 ease-(--ease-out)", open === menu.label && "rotate-180")}
                  />
                </button>
                <Dropdown items={menu.items} open={open === menu.label} />
              </li>
            ))}
            <li>
              <Link href="/pricing" className={linkClass}>
                Pricing
              </Link>
            </li>
            <li>
              <Link href="/transparency" className={linkClass}>
                Transparency
              </Link>
            </li>
          </ul>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            data-track-event="github_star_clicked"
            data-track-prop-location="header"
            className={cn(linkClass, "hidden h-9 gap-1.5 lg:inline-flex")}
          >
            <GitHubMark />
            Open source
            {starCount ? (
              <span className="tabular-nums text-ink-10">{starCount.toLocaleString("en-US")}</span>
            ) : null}
          </Link>
          <Link
            href={APP_URL}
            target="_blank"
            rel="noopener noreferrer"
            data-track-event="sign_in_clicked"
            data-track-prop-location="header"
            className={buttonClass("secondary", "hidden sm:inline-flex")}
          >
            Sign in
          </Link>
          <Link
            href={APP_URL}
            target="_blank"
            rel="noopener noreferrer"
            data-track-event="cloud_cta_clicked"
            data-track-prop-location="header"
            className={buttonClass("primary")}
          >
            Start free
          </Link>
          <button
            type="button"
            aria-label={mobile ? "Close menu" : "Open menu"}
            aria-expanded={mobile}
            onClick={() => setMobile((m) => !m)}
            className={cn("-mr-2 grid size-9 place-items-center rounded-md text-ink-11 md:hidden", focusRing)}
          >
            {mobile ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </nav>

      {mobile ? <MobileMenu onNavigate={() => setMobile(false)} /> : null}
    </header>
  );
}

function Dropdown({ items, open }: { items: NavItem[]; open: boolean }) {
  return (
    // pt bridges the gap to the trigger so the pointer can travel into it.
    <div data-state={open ? "open" : "closed"} className="menu-pop absolute top-full -left-2 pt-2.5">
      <ul className="grid w-[460px] grid-cols-2 gap-0.5 rounded-xl bg-popover p-1.5 shadow-menu">
        {items.map((item) => (
          <li key={item.href}>
            <MenuLink item={item} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function MenuLink({ item }: { item: NavItem }) {
  const Icon = item.icon;
  const ext = item.href.startsWith("http");
  return (
    <Link
      href={item.href}
      {...(ext ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={cn("group/item press flex gap-2.5 rounded-lg px-2.5 py-2 hover:bg-chip active:scale-[0.99]!", focusRing)}
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-ink-11 transition-colors duration-150 group-hover/item:text-ink-12" />
      <span className="min-w-0">
        <span className="block text-[13px] font-medium leading-5 text-ink-12">{item.label}</span>
        <span className="block text-[12px] leading-4 text-ink-10">{item.description}</span>
      </span>
    </Link>
  );
}

const mobileLinkClass = cn(
  "flex h-11 items-center rounded-md px-2.5 text-[15px] font-medium text-ink-12 active:bg-chip",
  focusRing,
);

function MobileMenu({ onNavigate }: { onNavigate: () => void }) {
  return (
    // Fixed below the header so it is the page's only scroll area. Any link tap
    // closes it, including same-page hash links that don't change the pathname.
    <div
      data-lenis-prevent
      onClick={(e) => (e.target as Element).closest("a") && onNavigate()}
      className="fixed inset-x-0 top-[46px] bottom-0 overflow-y-auto overscroll-contain border-t-[0.5px] border-ink-4 bg-page px-5 pb-[max(2rem,env(safe-area-inset-bottom))] md:hidden"
    >
      {menus.map((menu) => (
        <div key={menu.label} className="pt-5">
          <p className="px-2.5 text-[12px] text-ink-10">{menu.label}</p>
          <ul className="mt-1">
            {menu.items.map((item) => {
              const ext = item.href.startsWith("http");
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    {...(ext ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className={mobileLinkClass}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <ul className="mt-5 border-t-[0.5px] border-ink-4 pt-4">
        <li><Link href="/pricing" className={mobileLinkClass}>Pricing</Link></li>
        <li><Link href="/transparency" className={mobileLinkClass}>Transparency</Link></li>
        <li><Link href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className={mobileLinkClass}>Open source</Link></li>
        <li><Link href={APP_URL} target="_blank" rel="noopener noreferrer" className={mobileLinkClass}>Sign in</Link></li>
      </ul>
    </div>
  );
}

export function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={cn("size-4 shrink-0", className)}>
      <path d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2Z" />
    </svg>
  );
}
