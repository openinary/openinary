import {
  SolarCheckCircle,
  SolarKey,
  SolarLink,
  SolarLock,
  SolarPlay,
  SolarGallery,
  SolarUpload,
} from "@/components/site/solar";

import { Window } from "@/components/site/ui";
import { cn } from "@/lib/utils";

/**
 * Product shots, drawn in HTML rather than shipped as screenshots: they stay
 * sharp at any size, cost no bytes, and can't drift from a dashboard that no
 * longer looks like the picture. Every value shown is a plausible example, not
 * a real customer's data.
 */

/* ------------------------------------------------------------------ bits -- */

const scenes = [
  ["#7aa7cf", "#e7c39a", "#4f7a3c", "#2f4f2a"],
  ["#d7a77e", "#f2d3b0", "#6b4f3a", "#3e2c22"],
  ["#5f86b3", "#b8cde0", "#3d5a74", "#22364a"],
  ["#c98a8a", "#f0c7b2", "#7a5a6e", "#46344a"],
  ["#89b0a2", "#dce8d8", "#4c7464", "#2a4a3e"],
  ["#2b3a57", "#5f6f95", "#1d2840", "#111827"],
] as const;

/** A tiny landscape, so thumbnails read as photos without shipping any. */
export function Photo({
  scene = 0,
  className,
  round,
}: {
  scene?: number;
  className?: string;
  round?: boolean;
}) {
  const [sky, glow, hill, near] = scenes[scene % scenes.length];
  const id = `p${scene}`;
  return (
    <svg
      viewBox="0 0 120 80"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      className={cn("block", round && "rounded-full", className)}
    >
      <defs>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky} />
          <stop offset="1" stopColor={glow} />
        </linearGradient>
      </defs>
      <rect width="120" height="80" fill={`url(#${id}s)`} />
      <circle cx="88" cy="30" r="7" fill="#fff" opacity="0.55" />
      <path d="M0 52 Q25 36 50 48 T120 42 V80 H0Z" fill={hill} />
      <path d="M0 64 Q35 50 70 62 T120 58 V80 H0Z" fill={near} />
    </svg>
  );
}

function Dot({ tone = "green" }: { tone?: "green" | "amber" | "red" | "blue" | "grey" }) {
  const c = {
    green: "bg-ok",
    amber: "bg-warn",
    red: "bg-bad",
    blue: "bg-info",
    grey: "bg-ink-9",
  }[tone];
  return <span className={cn("inline-block size-1.5 shrink-0 rounded-full", c)} />;
}

function Tag({
  children,
  tone = "grey",
}: {
  children: React.ReactNode;
  tone?: "green" | "amber" | "red" | "blue" | "grey";
}) {
  const c = {
    green: "bg-ok-bg text-ok",
    amber: "bg-warn-bg text-warn",
    red: "bg-bad-bg text-bad",
    blue: "bg-info-bg text-info",
    grey: "bg-chip text-ink-11",
  }[tone];
  return (
    <span className={cn("inline-flex h-[18px] items-center gap-1 rounded px-1.5 text-[10px] font-medium", c)}>
      {children}
    </span>
  );
}

const mono = "font-mono text-[11px] leading-[18px]";

function PanelTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex h-9 items-center justify-between border-b-[0.5px] border-rule px-3.5 text-[11px] font-medium text-ink-12">
      <span className="flex items-center gap-2">{children}</span>
      {right ? <span className="text-ink-10">{right}</span> : null}
    </div>
  );
}

/* -------------------------------------------------------------- shots -- */

/** The URL is the API: params lit up over the image they produce. */
export function TransformMock({ className }: { className?: string }) {
  return (
    <Window className={className}>
      <PanelTitle right="200 · 38 KB · avif">Transform</PanelTitle>
      <div className="p-3.5">
        <div className={cn(mono, "flex items-center gap-1.5 overflow-hidden rounded-md bg-well px-2.5 py-1.5 whitespace-nowrap shadow-rule")}>
          <SolarLink className="size-3 shrink-0 text-ink-10" />
          <span className="text-ink-10">…/t/</span>
          <span className="text-ink-12">w_600,h_600,c_fill,r_max</span>
          <span className="text-ink-10">/hills.jpg</span>
        </div>
        <div className="mt-3 flex items-center gap-4">
          <div className="relative grid size-[120px] shrink-0 place-items-center">
            <Photo scene={0} round className="size-[112px]" />
            <span className="pointer-events-none absolute inset-0 border border-brand" />
            <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded bg-brand px-1 font-mono text-[9px] text-white">
              600 × 600
            </span>
          </div>
          <ul className="flex flex-col gap-1.5 text-[11px]">
            {[
              ["w_600", "width"],
              ["h_600", "height"],
              ["c_fill", "crop to fill"],
              ["r_max", "round"],
              ["f_auto", "best format"],
            ].map(([k, v]) => (
              <li key={k} className="flex items-center gap-2">
                <code className="rounded bg-chip px-1 font-mono text-[10px] text-ink-12">{k}</code>
                <span className="text-ink-10">{v}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Window>
  );
}

const jobs = [
  { file: "campaigns/spring.mp4", params: "w_1280,f_mp4", state: "processing", progress: 62, eta: "ready in ~14 s" },
  { file: "blog/interview.mov", params: "q_auto", state: "queued", progress: 0, eta: "starts in ~40 s" },
  { file: "hero/loop.mp4", params: "w_720,f_webm", state: "done", progress: 100, eta: "served from cache" },
  { file: "shop/unboxing.mp4", params: "so_2,f_jpg", state: "done", progress: 100, eta: "thumbnail, 1.1 s" },
];

/** Video jobs with the honest ETA a 202 carries. */
export function VideoJobsMock({ className }: { className?: string }) {
  return (
    <Window className={className}>
      <PanelTitle right="2 workers">Video jobs</PanelTitle>
      <ul className="divide-y-[0.5px] divide-rule">
        {jobs.map((j) => (
          <li key={j.file} className="px-3.5 py-2.5">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="flex min-w-0 items-center gap-2">
                <SolarPlay className="size-3 shrink-0 text-ink-10" />
                <span className="truncate text-ink-12">{j.file}</span>
              </span>
              <Tag tone={j.state === "done" ? "green" : j.state === "processing" ? "blue" : "amber"}>
                {j.state}
              </Tag>
            </div>
            <div className="mt-1.5 flex items-center gap-3">
              <code className="font-mono text-[10px] text-ink-10">{j.params}</code>
              <div className="h-1 flex-1 rounded-full bg-chip">
                <div
                  className={cn("h-full rounded-full", j.state === "done" ? "bg-ok" : "bg-info")}
                  style={{ width: `${j.progress}%` }}
                />
              </div>
              <span className="w-[96px] shrink-0 text-right text-[10px] text-ink-10">{j.eta}</span>
            </div>
          </li>
        ))}
      </ul>
    </Window>
  );
}

const bars = [22, 30, 26, 34, 40, 38, 52, 48, 44, 58, 62, 55, 49, 61, 70, 66, 59, 72, 80, 74, 68, 77, 86, 92];

const deliveries = [
  { path: "/t/w_800,f_auto/hero/hills.jpg", cache: "HIT", ms: 9 },
  { path: "/t/w_320,h_320,c_fill/team/ana.jpg", cache: "HIT", ms: 11 },
  { path: "/t/q_auto/campaigns/spring.mp4", cache: "MISS", ms: 184 },
  { path: "/t/audio/podcast.mp3", cache: "HIT", ms: 8 },
];

/** Deliveries charted by the hour, with the latest few underneath. */
export function LogsMock({ className, rows = 4 }: { className?: string; rows?: number }) {
  return (
    <Window className={className}>
      <PanelTitle right="last 24 hours">Deliveries</PanelTitle>
      <div className="px-3.5 pt-3">
        <div className="flex h-[64px] items-end gap-[3px]">
          {bars.map((h, i) => (
            <span
              key={i}
              className={cn("flex-1 rounded-[1px]", i === bars.length - 1 ? "bg-brand" : "bg-ink-6")}
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>
      <ul className="mt-2 divide-y-[0.5px] divide-rule border-t-[0.5px] border-rule">
        {deliveries.slice(0, rows).map((d) => (
          <li key={d.path} className={cn(mono, "flex items-center gap-2 px-3.5 py-1.5")}>
            <span className="text-ok">200</span>
            <span className="min-w-0 flex-1 truncate text-ink-11">{d.path}</span>
            <Tag tone={d.cache === "HIT" ? "green" : "amber"}>{d.cache}</Tag>
            <span className="w-10 text-right text-ink-10">{d.ms} ms</span>
          </li>
        ))}
      </ul>
    </Window>
  );
}

/** The drop-in uploader, mid-batch. */
export function UploadMock({ className }: { className?: string }) {
  const rows = [
    { name: "spring-lookbook-01.jpg", size: "3.2 MB", p: 100 },
    { name: "spring-lookbook-02.jpg", size: "2.9 MB", p: 100 },
    { name: "spring-teaser.mp4", size: "24 MB", p: 58 },
  ];
  return (
    <Window className={className}>
      <div className="p-3.5">
        <div className="grid place-items-center rounded-lg border border-dashed border-rule-strong bg-well px-4 py-5 text-center">
          <SolarUpload className="size-4 text-ink-10" />
          <p className="mt-1.5 text-[11px] text-ink-12">Drop files here or browse</p>
          <p className="text-[10px] text-ink-10">Images, video, audio and 3D up to 50 MB</p>
        </div>
        <ul className="mt-3 flex flex-col gap-2">
          {rows.map((r, i) => (
            <li key={r.name} className="flex items-center gap-2.5 rounded-md bg-surface p-1.5 shadow-rule">
              <Photo scene={i + 1} className="size-8 rounded" />
              <div className="min-w-0 flex-1">
                <div className="flex justify-between text-[10px]">
                  <span className="truncate text-ink-12">{r.name}</span>
                  <span className="text-ink-10">{r.p === 100 ? r.size : `${r.p}%`}</span>
                </div>
                <div className="mt-1 h-1 rounded-full bg-rule">
                  <div className="h-full rounded-full bg-ink-11" style={{ width: `${r.p}%` }} />
                </div>
              </div>
              {r.p === 100 ? <SolarCheckCircle className="size-3.5 text-ok" /> : null}
            </li>
          ))}
        </ul>
      </div>
    </Window>
  );
}

const buckets = [
  { name: "Cloudflare R2", logo: "/storage/cloudflare-r2.svg", detail: "acme-media · auto", state: "Connected" },
  { name: "Amazon S3", logo: "/storage/amazon-s3.svg", detail: "acme-archive · eu-west-3", state: "Connected" },
  { name: "Backblaze B2", logo: "/storage/backblaze.svg", detail: "acme-backups", state: "Read only" },
];

/** Buckets you already own, wired in. */
export function StorageMock({ className }: { className?: string }) {
  return (
    <Window className={className}>
      <PanelTitle right="prefix: public/">Storage</PanelTitle>
      <ul className="divide-y-[0.5px] divide-rule">
        {buckets.map((b) => (
          <li key={b.name} className="flex items-center gap-3 px-3.5 py-2.5">
            <span className="grid size-7 place-items-center rounded-md bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={b.logo} alt="" className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-ink-12">{b.name}</p>
              <p className="font-mono text-[10px] text-ink-10">{b.detail}</p>
            </div>
            <Tag tone={b.state === "Connected" ? "green" : "grey"}>
              <Dot tone={b.state === "Connected" ? "green" : "grey"} />
              {b.state}
            </Tag>
          </li>
        ))}
      </ul>
    </Window>
  );
}

/** API keys, hashed at rest, scoped by environment. */
export function ApiKeysMock({ className }: { className?: string }) {
  const keys = [
    { name: "production-web", last: "2 min ago", exp: "never" },
    { name: "staging", last: "yesterday", exp: "in 28 days" },
    { name: "ci-uploads", last: "3 hours ago", exp: "in 6 days" },
    { name: "old-mobile-app", last: "in March", exp: "disabled", off: true },
  ];
  return (
    <Window className={className}>
      <PanelTitle
        right={
          <span className="inline-flex h-5 items-center gap-1 rounded bg-ink-12 px-1.5 text-[10px] font-medium text-page">
            <SolarKey className="size-2.5" /> New key
          </span>
        }
      >
        API keys <span className="font-normal text-ink-10">hashed at rest</span>
      </PanelTitle>
      <ul className="divide-y-[0.5px] divide-rule">
        {keys.map((k) => (
          <li key={k.name} className={cn("grid grid-cols-[1fr_auto] items-center gap-2 px-3.5 py-2.5", k.off && "opacity-50")}>
            <div>
              <p className="flex items-center gap-2 text-[11px] text-ink-12">
                <SolarKey className="size-3 text-ink-10" />
                {k.name}
              </p>
              <p className="font-mono text-[10px] text-ink-10">sk_••••••••{k.name.length}f2a</p>
            </div>
            <div className="text-right text-[10px] text-ink-10">
              <p>used {k.last}</p>
              <p>{k.off ? <Tag>disabled</Tag> : `expires ${k.exp}`}</p>
            </div>
          </li>
        ))}
      </ul>
    </Window>
  );
}

/** A signed URL, and what happens when someone edits it. */
export function SignedUrlMock({ className }: { className?: string }) {
  return (
    <Window className={className}>
      <PanelTitle right="HMAC-SHA256">Signed URLs</PanelTitle>
      <pre className={cn(mono, "border-b-[0.5px] border-rule bg-well px-3.5 py-2.5 whitespace-pre text-ink-11")}>
        <span className="text-ink-10">{"// on your server"}</span>
        {"\n"}
        <span className="text-keyword">const</span> sig = <span className="text-info">generateSignature</span>(
        <span className="text-ok">&quot;w_200&quot;</span>, <span className="text-ok">&quot;invoices/0142.png&quot;</span>, API_SECRET)
      </pre>
      <ul className={cn(mono, "flex flex-col gap-2 p-3.5")}>
        <li className="flex items-center gap-2">
          <Tag tone="green">200</Tag>
          <span className="truncate text-ink-11">
            /authenticated/<span className="text-ink-12">s--9f2c41ab07d3e5c8</span>/w_200/invoices/0142.png
          </span>
        </li>
        <li className="flex items-center gap-2">
          <Tag tone="red">401</Tag>
          <span className="truncate text-ink-11">
            /authenticated/s--9f2c41ab07d3e5c8/<span className="text-bad">w_5000</span>/invoices/0142.png
          </span>
        </li>
        <li className="flex items-center gap-2">
          <Tag tone="amber">400</Tag>
          <span className="truncate text-ink-11">/authenticated/s--9f2c/w_200/invoices/0142.png</span>
        </li>
      </ul>
    </Window>
  );
}

/** A terminal, for the install story. Lines starting with $ are commands. */
export function TerminalMock({
  title = "~/acme",
  lines,
  className,
}: {
  title?: string;
  lines: string[];
  className?: string;
}) {
  return (
    <Window className={className} innerClassName="bg-well">
      <div className="flex h-8 items-center px-3.5 font-mono text-[11px] text-ink-10">{title}</div>
      <pre className={cn(mono, "overflow-x-auto px-3.5 pb-4 whitespace-pre")}>
        {lines.map((l, i) => (
          <div
            key={i}
            className={cn(
              l.startsWith("$") ? "text-ink-12" : "text-ink-11",
              l.startsWith("✓") || l.startsWith("◆") ? "text-ok" : "",
            )}
          >
            {l || " "}
          </div>
        ))}
      </pre>
    </Window>
  );
}

export const createLines = [
  "$ npx create-openinary@latest",
  "",
  "┌  create-openinary",
  "│",
  "◇  Project directory   media",
  "◇  Setup               Full stack (API + web dashboard)",
  "◇  Object storage      Use my own bucket (S3 / R2)",
  "◇  Start now with Docker?  Yes",
  "│",
  "✓  Secrets generated in media/.env",
  "✓  Container started",
  "└  Open http://localhost:3000 to create your admin account",
];

/** A file with line numbers, for the "read it yourself" blocks. */
export function CodeFile({
  name,
  href,
  code,
  className,
}: {
  name: string;
  href?: string;
  code: string;
  className?: string;
}) {
  const lines = code.replace(/\n$/, "").split("\n");
  return (
    <div className={cn("overflow-hidden rounded-lg bg-well shadow-rule", className)}>
      <div className="flex h-10 items-center justify-between border-b-[0.5px] border-rule px-4 font-mono text-[12px] text-ink-11">
        {name}
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="font-sans text-[12px] text-ink-10 hover:text-ink-12">
            Open the file ↗
          </a>
        ) : null}
      </div>
      <pre className="overflow-x-auto py-3 font-mono text-[12px] leading-[20px]">
        {lines.map((l, i) => (
          <div key={i} className="flex">
            <span className="w-10 shrink-0 pr-3 text-right text-ink-9 select-none">{i + 1}</span>
            <span className={cn("pr-4 whitespace-pre", l.trim().startsWith("#") ? "text-ink-10" : "text-ink-12")}>
              {l || " "}
            </span>
          </div>
        ))}
      </pre>
    </div>
  );
}

/** An image request, before and after: what the browser asked, what it got. */
export function FormatsMock({ className }: { className?: string }) {
  const rows = [
    { accept: "Safari 17", type: "image/avif", size: "38 KB" },
    { accept: "Chrome 130", type: "image/avif", size: "38 KB" },
    { accept: "Older Android", type: "image/webp", size: "52 KB" },
    { accept: "curl", type: "image/jpeg", size: "121 KB" },
  ];
  return (
    <Window className={className}>
      <PanelTitle right="one URL, f_auto">Negotiated formats</PanelTitle>
      <ul className="divide-y-[0.5px] divide-rule">
        {rows.map((r) => (
          <li key={r.accept} className="flex items-center gap-3 px-3.5 py-2 text-[11px]">
            <SolarGallery className="size-3 text-ink-10" />
            <span className="flex-1 text-ink-12">{r.accept}</span>
            <code className="font-mono text-[10px] text-ink-11">{r.type}</code>
            <span className="w-14 text-right text-ink-10">{r.size}</span>
          </li>
        ))}
      </ul>
    </Window>
  );
}

/** Code on the left, what came back on the right: the developer hero. */
export function CodeAndResponseMock({
  file,
  code,
  title,
  rows,
  className,
}: {
  file: string;
  code: string[];
  title: string;
  rows: [string, string][];
  className?: string;
}) {
  return (
    <Window className={className}>
      <div className="grid text-left md:grid-cols-[1.35fr_1fr]">
        <div className="border-b-[0.5px] border-rule md:border-r-[0.5px] md:border-b-0">
          <div className="flex h-9 items-center px-3.5 font-mono text-[11px] text-ink-11">{file}</div>
          <pre className="overflow-x-auto pb-4 font-mono text-[11px] leading-[19px]">
            {code.map((l, i) => (
              <div key={i} className="flex">
                <span className="w-8 shrink-0 pr-2.5 text-right text-ink-9 select-none">{i + 1}</span>
                <span className="pr-3 whitespace-pre text-ink-12">{l || " "}</span>
              </div>
            ))}
          </pre>
        </div>
        <div>
          <div className="flex h-9 items-center justify-between px-3.5 text-[11px] text-ink-12">
            {title}
            <span className="text-ok">200</span>
          </div>
          <ul className="flex flex-col gap-1.5 px-3.5 pb-4">
            {rows.map(([k, v]) => (
              <li key={k} className="flex items-center gap-2 font-mono text-[11px]">
                <Dot tone="green" />
                <span className="w-[86px] shrink-0 text-ink-12">{k}</span>
                <span className="truncate text-ink-10">{v}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Window>
  );
}

/** One upload, three sizes: the e-commerce hero. */
export function ProductSizesMock({ className }: { className?: string }) {
  const sizes = [
    { url: "w_1200,f_auto", label: "Zoom", size: "1200 px", box: "h-[180px] w-[180px] md:h-[220px] md:w-[220px]" },
    { url: "w_600,ar_1:1,c_pad,b_auto", label: "Grid", size: "600 px", box: "size-[120px] md:size-[150px]" },
    { url: "w_160,c_thumb", label: "Cart", size: "160 px", box: "size-[64px] md:size-[80px]" },
  ];
  return (
    <Window className={className}>
      <PanelTitle right="1 upload">products/lamp.jpg</PanelTitle>
      <div className="flex flex-wrap items-end justify-center gap-5 p-5 md:gap-8">
        {sizes.map((s, i) => (
          <figure key={s.label} className="flex flex-col items-center gap-2">
            <Photo scene={i + 1} className={cn("rounded-md", s.box)} />
            <figcaption className="text-center">
              <span className="block text-[11px] text-ink-12">
                {s.label} <span className="text-ink-10">{s.size}</span>
              </span>
              <code className="block font-mono text-[10px] text-ink-10">{s.url}</code>
            </figcaption>
          </figure>
        ))}
      </div>
    </Window>
  );
}

/** Two bills for the same month, side by side. */
export function CostMock({
  rival,
  ours,
  usage,
  className,
}: {
  rival: { name: string; plan: string; usd: string };
  ours: { name: string; plan: string; usd: string };
  usage: string[];
  className?: string;
}) {
  return (
    <Window className={className}>
      <PanelTitle right="same workload, one month">Monthly cost</PanelTitle>
      <div className="grid grid-cols-2">
        {[rival, ours].map((c, i) => (
          <div key={c.name} className={cn("p-4", i === 0 && "border-r-[0.5px] border-rule")}>
            <p className="text-[12px] text-ink-12">{c.name}</p>
            <p className="text-[11px] text-ink-10">{c.plan}</p>
            <p className={cn("mt-3 text-[28px] leading-none tracking-[-0.04em]", i === 0 ? "text-ink-10" : "text-ink-12")}>
              {c.usd}
              <span className="ml-1 text-[11px] tracking-normal text-ink-10">/mo</span>
            </p>
          </div>
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 border-t-[0.5px] border-rule px-4 py-2.5 text-[10px] text-ink-10">
        {usage.map((u) => (
          <li key={u}>{u}</li>
        ))}
      </ul>
    </Window>
  );
}

/** A private file, behind a key. */
export function PrivateMock({ className }: { className?: string }) {
  return (
    <Window className={className}>
      <PanelTitle right={<SolarLock className="size-3" />}>invoices/0142.png</PanelTitle>
      <div className="grid grid-cols-2 gap-px bg-rule text-[11px]">
        {[
          ["Visibility", "Signed only"],
          ["Bucket", "acme-private"],
          ["Served", "nosniff, exact type"],
          ["Checked", "by its bytes"],
        ].map(([k, v]) => (
          <div key={k} className="bg-frame px-3.5 py-2.5">
            <p className="text-[10px] text-ink-10">{k}</p>
            <p className="text-ink-12">{v}</p>
          </div>
        ))}
      </div>
    </Window>
  );
}
