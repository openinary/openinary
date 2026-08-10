"use client";

import { ImageIcon, MousePointer2, UploadCloud, X } from "lucide-react";
import { useEffect, useState } from "react";

import { FILE_UPLOADER_DOCS } from "@/components/get-started/uploader-card";
import { Button } from "@/components/ui/button";
import { cn, FADE_IN } from "@/lib/utils";

const DISMISSED_KEY = "openinary:uploader-nudge-dismissed";

/**
 * Whether the sidebar still owes the account this nudge. Lives here rather
 * than inside the card because the footer slot is shared: UpgradeCard has to
 * know the nudge is gone before it can offer whatever comes next.
 *
 * Starts dismissed and un-dismisses after mount. localStorage doesn't exist on
 * the server, so the honest default is the one that can't flash a card at
 * someone who already closed it - the card fades in a frame later instead.
 */
export function useUploaderNudge(): [boolean, () => void] {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISSED_KEY) === "1");
    } catch {
      // Private mode, or storage disabled. Staying dismissed is the harmless
      // half of that trade: a nudge that never shows beats one that can't be
      // closed.
    }
  }, []);

  return [
    dismissed,
    () => {
      setDismissed(true);
      try {
        window.localStorage.setItem(DISMISSED_KEY, "1");
      } catch {
        // Gone for this session, back on the next. Nothing depends on it.
      }
    },
  ];
}

/**
 * The sidebar-sized cut of UploaderCard: same 7s keyframes (index.css), one
 * file instead of two, and the dropzone's copy dropped - at 240px the icon
 * carries it. Sharing the CSS rather than the markup is deliberate; a
 * `compact` prop threading through every className would cost more than the
 * dozen elements below.
 */
export function UploaderNudge({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      className={cn(
        "mb-1 overflow-hidden rounded-lg border bg-black/[0.04] group-data-[collapsible=icon]:hidden dark:bg-black/20",
        FADE_IN,
      )}
    >
      {/* Same framing as the page card, at a quarter of the width: its own
          surface, a gutter on three sides, and a product zoomed past the
          right and bottom edges.

          Three surfaces, each a step darker than the one it sits on: sidebar,
          card, frame. A black wash rather than a token because the greys
          inverse between themes - --sidebar-accent and --muted are both
          *lighter* than --sidebar in the dark theme, so either one would
          climb the ladder the wrong way. This darkens whatever is underneath,
          which is the whole rule. */}
      <div className="p-1.5 pb-0">
        <div
          // Tall enough for the whole progress line: at 72px the frame cut it
          // off at the exact moment it had something to show. What it still
          // clips is the row's bottom edge, which costs the demo nothing.
          className="relative h-[84px] overflow-hidden rounded-t bg-black/[0.05] ring-1 ring-border/60 ring-inset dark:bg-black/25"
          data-uploader-demo
        >
          <div className="-top-2 absolute right-0 left-3 origin-top-left scale-105">
            <div className="relative flex animate-[uploader-zone_7s_ease-out_infinite] items-center justify-center rounded-md border border-input border-dashed py-3">
              {/* The wrapper centres; uploader-drop owns transform and would
                  eat the -50% if the two shared an element. */}
              <span className="-translate-x-1/2 absolute top-3 left-1/2">
                <span className="block animate-[uploader-drop_7s_ease-out_infinite] opacity-0">
                  <span className="flex size-6 items-center justify-center rounded-md border bg-card shadow-sm">
                    <ImageIcon className="size-3 text-muted-foreground" />
                  </span>
                  {/* No name label on this one - at 240px the arrow alone is
                      the whole point, and a badge would sit on the file. */}
                  <MousePointer2
                    strokeWidth={1.5}
                    className="-right-2.5 -bottom-3 absolute size-3.5 origin-top-left animate-[uploader-cursor_7s_ease-out_infinite] fill-foreground text-background drop-shadow-sm"
                  />
                </span>
              </span>
              <UploadCloud className="size-4 text-muted-foreground" />
            </div>

            <div className="mt-1.5 flex animate-[uploader-row_7s_ease-out_infinite] items-center gap-2 rounded-md border bg-card p-1.5">
              <span className="flex size-6 shrink-0 items-center justify-center rounded bg-muted">
                <ImageIcon className="size-3 text-muted-foreground" />
              </span>
              <span className="min-w-0 flex-1">
                {/* leading pinned: the row's height is what decides whether
                    the progress line clears the frame's bottom edge, and an
                    11px font's default line box is not a number to plan on. */}
                <span className="block truncate font-medium text-[11px] leading-4">
                  hero.jpg
                </span>
                {/* Bar and "Uploaded" cross-fade in place so the row keeps one
                    height and nothing below it moves. */}
                <span className="relative mt-0.5 block h-3">
                  <span className="absolute inset-x-0 top-1 block h-1 animate-[uploader-progress_7s_ease-out_infinite] overflow-hidden rounded-full bg-primary/15 opacity-0">
                    <span className="block h-full w-full animate-[uploader-fill_7s_ease-out_infinite] rounded-full bg-primary" />
                  </span>
                  <span className="absolute inset-0 flex animate-[uploader-done_7s_ease-out_infinite] items-center text-[10px] text-muted-foreground">
                    Uploaded
                  </span>
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t p-3">
        {/* The dismiss sits on the title row rather than the card's corner,
            where it would land on the frame. Same title-left/control-right row
            the checklist state uses. */}
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-sm">Uploads from your app</p>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Dismiss"
            className="-mr-1 size-6 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={onDismiss}
          >
            <X className="size-3" />
          </Button>
        </div>
        <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
          <code className="font-mono">&lt;FileUploader /&gt;</code> handles the
          drop zone, the signature and the progress.
        </p>
        <Button asChild size="sm" className="mt-3 h-7 w-full text-xs">
          <a href={FILE_UPLOADER_DOCS} target="_blank" rel="noreferrer">
            Get the snippet
          </a>
        </Button>
      </div>
    </div>
  );
}
