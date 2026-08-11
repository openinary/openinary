"use client";

import {
  CheckCircle2,
  Film,
  ImageIcon,
  MousePointer2,
  UploadCloud,
} from "lucide-react";
import Link from "next/link";
import { CopyPromptButton } from "@/components/get-started/prompt-copy";
import { Button } from "@/components/ui/button";

/** Where the sidebar's UploaderNudge sends people. */
export const FILE_UPLOADER_DOCS =
  "https://docs.openinary.dev/cloud/file-uploader";

/**
 * The demo half of Get started, under a heading of its own so it reads as one.
 *
 * It is the same bordered box as the checklist above it, and unlabelled it
 * read as a fourth step - which is how the uploader and the playgrounds came
 * to be steps in the first place, ticking the list to 2 of 4 for someone who
 * had not integrated anything. They are worth showing and worth playing with;
 * they are just not evidence that anything was wired up.
 */
export function UploaderCard() {
  return (
    <div className="space-y-3">
      <p className="font-medium text-sm">Upload files from your app</p>
      <UploaderDemo />
    </div>
  );
}

/**
 * A looping replay of what <FileUploader /> does, sat above the pitch for it.
 *
 * It is a drawing, not the component: mounting the real one here would need an
 * API key to sign with and would bill an upload every time the page is open.
 * The markup below is copied from the registry component's, the one `shadcn add
 * @openinary/file-uploader` writes into the user's project, so the drawing
 * can't drift into showing an uploader we don't ship - dashed dropzone, one row
 * per file, progress bar, then "Uploaded".
 *
 * Every layer runs the same 7s CSS cycle (see index.css); the second file only
 * differs by its animation-delay. No timer, no state, no cleanup, and the loop
 * keeps running while React is busy elsewhere. Rest state - what a
 * prefers-reduced-motion visitor gets - is the finished upload.
 */
function UploaderDemo() {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      {/* Gutter on three sides and none at the bottom, so the frame runs into
          the text rather than floating in it. Its own surface too: the demo
          has to read as a thing being shown, not as more card.

          A black wash rather than bg-muted, which is darker than the card in
          the light theme and lighter than it in the dark one - the frame has
          to sit under the card either way. */}
      <div className="p-2 pb-0">
        <div
          className="relative h-52 overflow-hidden rounded-t-md bg-black/[0.05] ring-1 ring-border/60 ring-inset dark:bg-black/25"
          data-uploader-demo
        >
          {/* Zoomed and anchored top-left, which is what puts the dropzone's
              top edge, its right side and the tail of the second file outside
              the frame. A product too big for its window reads as one being
              focused on - and the file now enters from off-frame, which is
              where a dragged file actually comes from. */}
          <div className="-top-4 absolute right-0 left-5 origin-top-left scale-[1.06]">
            <div className="relative flex animate-[uploader-zone_7s_ease-out_infinite] flex-col items-center justify-center gap-1.5 rounded-lg border border-input border-dashed px-6 py-7 text-center">
              {/* Lands on the dropzone just before the rows appear. Two stacked
                  cards because two rows follow. The centering lives on the
                  wrapper: uploader-drop owns transform, and sharing it would
                  cost the chip its -50%. */}
              <span className="-translate-x-1/2 absolute top-7 left-1/2">
                <span className="block animate-[uploader-drop_7s_ease-out_infinite] opacity-0">
                  <span className="absolute inset-0 translate-x-1 translate-y-1 rounded-md border bg-card" />
                  <span className="relative flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 shadow-sm">
                    <ImageIcon className="size-3 text-muted-foreground" />
                    <span className="font-medium text-[11px]">hero.jpg</span>
                  </span>

                  {/* Whoever dragged it in. Inside the chip's wrapper, so the
                      two arrive and leave as one gesture. */}
                  <span className="-right-3 -bottom-4 absolute flex items-start">
                    <MousePointer2
                      strokeWidth={1.5}
                      className="size-4 origin-top-left animate-[uploader-cursor_7s_ease-out_infinite] fill-foreground text-background drop-shadow-sm"
                    />
                    <span className="-ml-0.5 mt-2.5 rounded bg-violet-500 px-1 py-px font-medium text-[9px] text-white">
                      Your user
                    </span>
                  </span>
                </span>
              </span>

              <UploadCloud className="size-6 text-muted-foreground" />
              <p className="font-medium text-xs">
                Drag &amp; drop files here, or{" "}
                <span className="text-primary underline underline-offset-4">
                  browse
                </span>
              </p>
              <p className="text-[11px] text-muted-foreground">
                Up to 50.0 MB per file
              </p>
            </div>

            <ul className="mt-2 space-y-2">
              <DemoRow icon={ImageIcon} name="hero.jpg" size="1.8 MB" />
              <DemoRow icon={Film} name="promo.mp4" size="12.4 MB" delayed />
            </ul>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
        <div className="min-w-0">
          <p className="font-medium text-sm">
            Allow your users to upload their files
          </p>
          <p className="mt-0.5 text-muted-foreground text-xs leading-relaxed">
            <code className="mr-1 font-mono">&lt;FileUploader/&gt;</code>{" "}
            installs into your project as source - a @shadcn/ui compatible
            component with drag &amp; drop, progress, cancel, and retry already
            wired. It adapts to your design system and integrates directly with
            our transformation pipeline.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild className="h-7 text-xs" size="sm" variant="outline">
            <Link href="/get-started/integrate">Get the snippet</Link>
          </Button>
          <CopyPromptButton />
        </div>
      </div>
    </div>
  );
}

/**
 * `delayed` offsets the whole cycle rather than any single step, so the second
 * file trails the first through every phase - drop, fill, done - and the two
 * never need their own keyframes. backwards holds it hidden through the delay,
 * without which it would flash its finished state for 800ms on mount.
 */
function DemoRow({
  icon: Icon,
  name,
  size,
  delayed = false,
}: {
  icon: typeof ImageIcon;
  name: string;
  size: string;
  delayed?: boolean;
}) {
  return (
    <li
      className={
        delayed
          ? "flex animate-[uploader-row_7s_ease-out_0.8s_infinite_backwards] items-center gap-3 rounded-md border bg-card p-2"
          : "flex animate-[uploader-row_7s_ease-out_infinite] items-center gap-3 rounded-md border bg-card p-2"
      }
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
        <Icon className="size-4 text-muted-foreground" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate font-medium text-xs">{name}</span>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {size}
          </span>
        </span>

        {/* The bar and the "Uploaded" line cross-fade in place, so the row
            keeps one height and nothing below it moves. */}
        <span className="relative mt-1 block h-3.5">
          <span
            className={
              delayed
                ? "absolute inset-x-0 top-1 block h-1.5 animate-[uploader-progress_7s_ease-out_0.8s_infinite_backwards] overflow-hidden rounded-full bg-primary/15 opacity-0"
                : "absolute inset-x-0 top-1 block h-1.5 animate-[uploader-progress_7s_ease-out_infinite] overflow-hidden rounded-full bg-primary/15 opacity-0"
            }
          >
            <span
              className={
                delayed
                  ? "block h-full w-full animate-[uploader-fill_7s_ease-out_0.8s_infinite_backwards] rounded-full bg-primary"
                  : "block h-full w-full animate-[uploader-fill_7s_ease-out_infinite] rounded-full bg-primary"
              }
            />
          </span>

          <span
            className={
              delayed
                ? "absolute inset-0 flex animate-[uploader-done_7s_ease-out_0.8s_infinite_backwards] items-center gap-1 text-[11px] text-muted-foreground"
                : "absolute inset-0 flex animate-[uploader-done_7s_ease-out_infinite] items-center gap-1 text-[11px] text-muted-foreground"
            }
          >
            <CheckCircle2 className="size-3 text-green-600" />
            Uploaded
          </span>
        </span>
      </span>
    </li>
  );
}
