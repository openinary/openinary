import {
  Command,
  HardDrive,
  History,
  Layers,
  RefreshCw,
  Zap,
} from "lucide-react";

import { Eyebrow, Section, gutter } from "@/components/home/section";

const reasons = [
  {
    icon: Zap,
    title: "One upload, every size",
    body: "Upload a file once, then ask for it cropped, resized or converted. Each version is made on request, no thumbnail folder to maintain.",
  },
  {
    icon: Layers,
    title: "Every format, one API",
    body: "Images and video go through the same interface. JPEG, PNG, WebP, AVIF, MP4, one place to send them and one place to get them back.",
  },
  {
    icon: History,
    title: "Fast after the first hit",
    body: "The first request for a version pays for it, everyone after is served from cache. Replace an original and its old versions go with it.",
  },
  {
    icon: Command,
    title: "Run it your way",
    body: "One command and Docker runs it on your own infrastructure, or create an account and we run it for you. Same engine either way.",
  },
  {
    icon: HardDrive,
    title: "Yours by architecture",
    body: "Your files live in your own bucket, S3, R2 or MinIO, whatever you already run. Nothing gets locked into a store you have to migrate out of.",
  },
  {
    icon: RefreshCw,
    title: "Open by default",
    body: "The whole thing is AGPL on GitHub, engine, dashboard and hosted version included. Nothing is held back for a paid tier.",
  },
];

export function Why() {
  return (
    <Section>
      <div className={`${gutter} pb-9 pt-14 md:pt-20`}>
        <Eyebrow>Why Openinary</Eyebrow>
      </div>

      {/* The 1px gap over a muted ground draws the grid hairlines, so cells stay
          separated at every breakpoint without per-cell border bookkeeping. The
          top line is padding, not a border: --border is semi-transparent in dark
          mode, so a border painted over this same background would stack two
          layers and read twice as heavy as the gaps below it. */}
      <div className="grid gap-px bg-border pt-px sm:grid-cols-2 lg:grid-cols-3">
        {reasons.map(({ icon: Icon, title, body }) => (
          <article key={title} className="bg-background px-6 py-8 md:px-8">
            <div className="flex items-center gap-2.5">
              <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <h3 className="text-sm font-medium leading-5 text-foreground">
                {title}
              </h3>
            </div>
            <p className="mt-2.5 text-sm leading-[1.63] text-muted-foreground">
              {body}
            </p>
          </article>
        ))}
      </div>
    </Section>
  );
}
