import { cn } from "@/lib/utils";
import React from "react";
import { Portal, PortalBackdrop } from "@/components/ui/portal";
import { Button } from "@/components/ui/button";
import { navLinks } from "@/components/header";
import { XIcon, MenuIcon } from "lucide-react";

export function MobileNav() {
  const [open, setOpen] = React.useState(false);
  // Where the header actually ends, measured when the menu opens. A fixed
  // offset would be wrong half the time: the announcement banner above the
  // header is dismissible, and it scrolls away, so the header sits at a
  // different height depending on both.
  const [topOffset, setTopOffset] = React.useState(0);

  const toggle = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!open) {
      const header = event.currentTarget.closest("header");
      setTopOffset(header ? header.getBoundingClientRect().bottom : 0);
    }
    setOpen(!open);
  };

  return (
    <div className="md:hidden">
      <Button
        aria-controls="mobile-menu"
        aria-expanded={open}
        aria-label="Toggle menu"
        className="md:hidden"
        onClick={toggle}
        size="icon"
        variant="outline"
        data-track-event="mobile_menu_toggled"
        data-track-prop-location="header"
      >
        {open ? (
          <XIcon className="size-4.5" />
        ) : (
          <MenuIcon className="size-4.5" />
        )}
      </Button>
      {open && (
        <Portal id="mobile-menu" style={{ top: topOffset }}>
          <PortalBackdrop />
          <div
            className={cn(
              "data-[slot=open]:zoom-in-97 ease-out data-[slot=open]:animate-in",
              "size-full p-4",
            )}
            data-slot={open ? "open" : "closed"}
          >
            <div className="grid gap-y-2">
              {navLinks.map((link) => (
                <Button
                  asChild
                  className="justify-start"
                  key={link.label}
                  variant="ghost"
                  data-track-event="nav_link_clicked"
                  data-track-prop-location="mobile_nav"
                >
                  <a href={link.href}>{link.label}</a>
                </Button>
              ))}
            </div>
            {/* app.openinary.dev serves the sign-in form when signed out and
                the dashboard when signed in (see app-shell in apps/cloud/web),
                so both CTAs land there. */}
            <div className="mt-12 flex flex-col gap-2">
              <Button
                asChild
                className="w-full"
                variant="outline"
                data-track-event="sign_in_clicked"
                data-track-prop-location="mobile_nav"
              >
                <a href="https://app.openinary.dev">Sign In</a>
              </Button>
              <Button
                asChild
                className="w-full"
                data-track-event="get_started_clicked"
                data-track-prop-location="mobile_nav"
              >
                <a href="https://app.openinary.dev">Get Started</a>
              </Button>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}
